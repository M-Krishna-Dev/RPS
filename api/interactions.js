import { InteractionType, InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { verifyKey } from "discord-interactions";

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

const leaderboard = {};

const CHOICES = ["rock", "paper", "scissors"];

const BEATS = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

function getResult(a, b) {
  if (a === b) return "draw";
  if (BEATS[a] === b) return "a";
  return "b";
}

function buildLeaderboardComponents(guildId) {
  const board = leaderboard[guildId] || {};
  const sorted = Object.entries(board)
    .sort((x, y) => (y[1].wins - y[1].losses) - (x[1].wins - x[1].losses))
    .slice(0, 10);

  if (sorted.length === 0) {
    return [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: "## Leaderboard\nNo games played yet.",
          },
        ],
      },
    ];
  }

  const rows = sorted
    .map(([userId, stats], i) => {
      const medal = i === 0 ? "**#1**" : i === 1 ? "**#2**" : i === 2 ? "**#3**" : `#${i + 1}`;
      return `${medal} <@${userId}> — W: ${stats.wins} L: ${stats.losses} D: ${stats.draws}`;
    })
    .join("\n");

  return [
    {
      type: 17,
      components: [
        {
          type: 10,
          content: `## Leaderboard\n${rows}`,
        },
      ],
    },
  ];
}

function buildChallengeComponents(challengerId, opponentId) {
  return [
    {
      type: 17,
      components: [
        {
          type: 10,
          content: `## Rock Paper Scissors\n<@${challengerId}> has challenged <@${opponentId}>!\n<@${opponentId}>, pick your move:`,
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: "Rock",
              custom_id: `rps_move:${challengerId}:${opponentId}:rock`,
            },
            {
              type: 2,
              style: 1,
              label: "Paper",
              custom_id: `rps_move:${challengerId}:${opponentId}:paper`,
            },
            {
              type: 2,
              style: 1,
              label: "Scissors",
              custom_id: `rps_move:${challengerId}:${opponentId}:scissors`,
            },
          ],
        },
      ],
    },
  ];
}

function buildChallengerPickComponents(challengerId, opponentId, opponentMove) {
  return [
    {
      type: 17,
      components: [
        {
          type: 10,
          content: `## Rock Paper Scissors\n<@${opponentId}> has picked. <@${challengerId}>, now pick your move:`,
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: "Rock",
              custom_id: `rps_challenger:${challengerId}:${opponentId}:${opponentMove}:rock`,
            },
            {
              type: 2,
              style: 1,
              label: "Paper",
              custom_id: `rps_challenger:${challengerId}:${opponentId}:${opponentMove}:paper`,
            },
            {
              type: 2,
              style: 1,
              label: "Scissors",
              custom_id: `rps_challenger:${challengerId}:${opponentId}:${opponentMove}:scissors`,
            },
          ],
        },
      ],
    },
  ];
}

function buildResultComponents(challengerId, challengerMove, opponentId, opponentMove, result) {
  const moveLabel = { rock: "Rock", paper: "Paper", scissors: "Scissors" };
  let outcome;
  if (result === "draw") {
    outcome = "It's a **draw**!";
  } else if (result === "a") {
    outcome = `<@${challengerId}> wins!`;
  } else {
    outcome = `<@${opponentId}> wins!`;
  }

  return [
    {
      type: 17,
      components: [
        {
          type: 10,
          content: `## Rock Paper Scissors — Result\n<@${challengerId}> played **${moveLabel[challengerMove]}**\n<@${opponentId}> played **${moveLabel[opponentMove]}**\n\n${outcome}`,
        },
      ],
    },
  ];
}

function updateStats(guildId, userId, outcome) {
  if (!leaderboard[guildId]) leaderboard[guildId] = {};
  if (!leaderboard[guildId][userId]) leaderboard[guildId][userId] = { wins: 0, losses: 0, draws: 0 };
  leaderboard[guildId][userId][outcome]++;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end("Method Not Allowed");
  }

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");

  const isValid = verifyKey(rawBody, signature, timestamp, PUBLIC_KEY);
  if (!isValid) {
    return res.status(401).end("Invalid signature");
  }

  const interaction = JSON.parse(rawBody);

  if (interaction.type === InteractionType.Ping) {
    return res.json({ type: InteractionResponseType.Pong });
  }

  const guildId = interaction.guild_id;

  if (interaction.type === InteractionType.ApplicationCommand) {
    const { name } = interaction.data;

    if (name === "challenge") {
      const targetUser = interaction.data.options?.find((o) => o.name === "user")?.value;
      const challengerId = interaction.member?.user?.id || interaction.user?.id;

      if (!targetUser) {
        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            components: [
              {
                type: 17,
                components: [{ type: 10, content: "You must mention a user to challenge." }],
              },
            ],
          },
        });
      }

      if (targetUser === challengerId) {
        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            components: [
              {
                type: 17,
                components: [{ type: 10, content: "You cannot challenge yourself." }],
              },
            ],
          },
        });
      }

      return res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          flags: MessageFlags.IsComponentsV2,
          components: buildChallengeComponents(challengerId, targetUser),
        },
      });
    }

    if (name === "leaderboard") {
      return res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          flags: MessageFlags.IsComponentsV2,
          components: buildLeaderboardComponents(guildId),
        },
      });
    }
  }

  if (interaction.type === InteractionType.MessageComponent) {
    const customId = interaction.data.custom_id;
    const userId = interaction.member?.user?.id || interaction.user?.id;

    if (customId.startsWith("rps_move:")) {
      const [, challengerId, opponentId, opponentMove] = customId.split(":");

      if (userId !== opponentId) {
        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            components: [
              {
                type: 17,
                components: [{ type: 10, content: "This challenge is not for you." }],
              },
            ],
          },
        });
      }

      return res.json({
        type: InteractionResponseType.UpdateMessage,
        data: {
          flags: MessageFlags.IsComponentsV2,
          components: buildChallengerPickComponents(challengerId, opponentId, opponentMove),
        },
      });
    }

    if (customId.startsWith("rps_challenger:")) {
      const [, challengerId, opponentId, opponentMove, challengerMove] = customId.split(":");

      if (userId !== challengerId) {
        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            components: [
              {
                type: 17,
                components: [{ type: 10, content: "This challenge is not for you." }],
              },
            ],
          },
        });
      }

      const result = getResult(challengerMove, opponentMove);

      if (result === "draw") {
        updateStats(guildId, challengerId, "draws");
        updateStats(guildId, opponentId, "draws");
      } else if (result === "a") {
        updateStats(guildId, challengerId, "wins");
        updateStats(guildId, opponentId, "losses");
      } else {
        updateStats(guildId, challengerId, "losses");
        updateStats(guildId, opponentId, "wins");
      }

      return res.json({
        type: InteractionResponseType.UpdateMessage,
        data: {
          flags: MessageFlags.IsComponentsV2,
          components: buildResultComponents(challengerId, challengerMove, opponentId, opponentMove, result),
        },
      });
    }
  }

  return res.status(400).end("Unknown interaction");
}

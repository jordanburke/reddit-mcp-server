import { getRedditClient } from "../client/reddit-client"
import { formatUserInfo } from "../utils/formatters"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

export async function getUserInfo(params: { username: string }) {
  const { username } = params
  const client = getRedditClient()

  if (!client) {
    throw new McpError(ErrorCode.InternalError, "Reddit client not initialized")
  }

  try {
    // Getting user info
    const user = await client.getUser(username)
    const formattedUser = formatUserInfo(user)

    return {
      content: [
        {
          type: "text",
          text: `
# User Information: u/${formattedUser.username}

## Profile Overview
- Username: u/${formattedUser.username}
- Karma:
  - Comment Karma: ${formattedUser.karma.commentKarma.toLocaleString()}
  - Post Karma: ${formattedUser.karma.postKarma.toLocaleString()}
  - Total Karma: ${formattedUser.karma.totalKarma.toLocaleString()}
- Account Status: ${formattedUser.accountStatus.join(", ")}
- Account Created: ${formattedUser.accountCreated}
- Profile URL: ${formattedUser.profileUrl}

## Activity Analysis
- ${formattedUser.activityAnalysis.replace(/\n  - /g, "\n- ")}

## Recommendations
- ${formattedUser.recommendations.replace(/\n  - /g, "\n- ")}
          `,
        },
      ],
    }
  } catch (error) {
    // Error will be logged by the server
    throw new McpError(ErrorCode.InternalError, `Failed to fetch user data: ${String(error)}`)
  }
}

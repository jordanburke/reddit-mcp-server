# Reddit MCP Server Roadmap

## Implemented Features ✅

- Get subreddit info
- Get top posts from subreddits
- Get specific post details
- Get trending subreddits
- Get user information
- Create posts (text/link)
- Reply to posts

## High Priority Features 🔴

### 1. Search Functionality

- **Endpoint**: `/search` and `/r/{subreddit}/search`
- **Tool Name**: `search_reddit`
- **Parameters**: query, subreddit (optional), sort, time_filter, limit
- **Use Case**: Finding specific content, research, monitoring topics

### 2. Get Post Comments

- **Endpoint**: `/r/{subreddit}/comments/{article}`
- **Tool Name**: `get_post_comments`
- **Parameters**: post_id, subreddit, sort, limit
- **Use Case**: Reading full discussions, analyzing conversations

### 3. User Activity

- **Endpoints**: `/user/{username}/submitted`, `/user/{username}/comments`
- **Tool Names**: `get_user_posts`, `get_user_comments`
- **Parameters**: username, sort, time_filter, limit
- **Use Case**: User research, activity analysis

## Medium Priority Features 🟡

### 4. Voting System

- **Endpoint**: `/api/vote`
- **Tool Name**: `vote_on_content`
- **Parameters**: id, direction (1, 0, -1)
- **Use Case**: Engaging with content

### 5. Save/Unsave Content

- **Endpoints**: `/api/save`, `/api/unsave`
- **Tool Names**: `save_content`, `unsave_content`
- **Parameters**: id
- **Use Case**: Bookmarking for later

### 6. Delete Own Content

- **Endpoint**: `/api/del`
- **Tool Name**: `delete_content`
- **Parameters**: id
- **Use Case**: Content management

## Low Priority Features 🟢

### 7. Edit Posts/Comments

- **Endpoint**: `/api/editusertext`
- **Tool Name**: `edit_content`
- **Parameters**: thing_id, text
- **Use Case**: Fixing typos, updating content

### 8. Get Saved Content

- **Endpoint**: `/user/{username}/saved`
- **Tool Name**: `get_saved_content`
- **Parameters**: username, type, limit
- **Use Case**: Retrieving bookmarked content

### 9. Subscribe/Unsubscribe

- **Endpoints**: `/api/subscribe`
- **Tool Name**: `manage_subscription`
- **Parameters**: subreddit, action
- **Use Case**: Managing subreddit subscriptions

## Implementation Notes

- All write operations require user authentication (username/password)
- Rate limiting should be implemented to respect Reddit's API limits
- Error handling should provide clear messages about authentication requirements
- Consider implementing caching for frequently accessed data

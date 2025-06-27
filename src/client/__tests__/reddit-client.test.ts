import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import axios from 'axios'
import { RedditClient } from '../reddit-client'
import type { RedditClientConfig } from '../../types'

// Mock axios
vi.mock('axios')

describe('RedditClient', () => {
  let client: RedditClient
  const mockConfig: RedditClientConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    userAgent: 'TestApp/1.0.0',
    username: 'testuser',
    password: 'testpass'
  }

  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    defaults: {
      headers: {
        common: {}
      }
    },
    interceptors: {
      response: {
        use: vi.fn()
      }
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-expect-error - Mocking axios.create
    axios.create = vi.fn().mockReturnValue(mockAxiosInstance)
    // @ts-expect-error - Mocking axios.post
    axios.post = vi.fn()
    client = new RedditClient(mockConfig)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://oauth.reddit.com',
        headers: {
          'User-Agent': mockConfig.userAgent
        }
      })
    })

    it('should set up response interceptor', () => {
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled()
    })
  })

  describe('authenticate', () => {
    it('should authenticate with user credentials', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'test-token',
          expires_in: 3600
        }
      }

      // @ts-expect-error - Mocking axios.post
      axios.post.mockResolvedValue(mockTokenResponse)

      await client.authenticate()

      expect(axios.post).toHaveBeenCalledWith(
        'https://www.reddit.com/api/v1/access_token',
        expect.any(URLSearchParams),
        expect.objectContaining({
          auth: {
            username: mockConfig.clientId,
            password: mockConfig.clientSecret
          },
          headers: {
            'User-Agent': mockConfig.userAgent,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      )

      // Check that access token was set
      expect(mockAxiosInstance.defaults.headers.common['Authorization']).toBe('Bearer test-token')
    })

    it('should authenticate with client credentials only when no username/password', async () => {
      const configWithoutUser: RedditClientConfig = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        userAgent: 'TestApp/1.0.0'
      }

      const clientReadOnly = new RedditClient(configWithoutUser)
      const mockTokenResponse = {
        data: {
          access_token: 'test-token-readonly',
          expires_in: 3600
        }
      }

      // @ts-expect-error - Mocking axios.post
      axios.post.mockResolvedValue(mockTokenResponse)

      await clientReadOnly.authenticate()

      const callArgs = axios.post.mock.calls[0]
      const authData = callArgs[1] as URLSearchParams
      expect(authData.get('grant_type')).toBe('client_credentials')
      expect(authData.get('username')).toBeNull()
      expect(authData.get('password')).toBeNull()
    })

    it('should not re-authenticate if token is still valid', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'test-token',
          expires_in: 3600
        }
      }

      // @ts-expect-error - Mocking axios.post
      axios.post.mockResolvedValue(mockTokenResponse)

      // First authentication
      await client.authenticate()
      expect(axios.post).toHaveBeenCalledTimes(1)

      // Second authentication should not make another request
      await client.authenticate()
      expect(axios.post).toHaveBeenCalledTimes(1)
    })

    it('should throw error on authentication failure', async () => {
      // @ts-expect-error - Mocking axios.post
      axios.post.mockRejectedValue(new Error('Auth failed'))

      await expect(client.authenticate()).rejects.toThrow('Failed to authenticate with Reddit API')
    })
  })

  describe('getUser', () => {
    it('should fetch user information', async () => {
      const mockUserData = {
        data: {
          data: {
            name: 'testuser',
            id: '123',
            comment_karma: 100,
            link_karma: 200,
            is_mod: false,
            is_gold: true,
            is_employee: false,
            created_utc: 1234567890
          }
        }
      }

      // Mock authentication
      // @ts-expect-error - Mocking axios.post
      axios.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      })

      mockAxiosInstance.get.mockResolvedValue(mockUserData)

      const user = await client.getUser('testuser')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/user/testuser/about.json')
      expect(user).toEqual({
        name: 'testuser',
        id: '123',
        commentKarma: 100,
        linkKarma: 200,
        totalKarma: 300,
        isMod: false,
        isGold: true,
        isEmployee: false,
        createdUtc: 1234567890,
        profileUrl: 'https://reddit.com/user/testuser'
      })
    })

    it('should throw error when user fetch fails', async () => {
      // Mock authentication
      // @ts-expect-error - Mocking axios.post
      axios.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      })

      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'))

      await expect(client.getUser('testuser')).rejects.toThrow('Failed to get user info for testuser')
    })
  })

  describe('getSubredditInfo', () => {
    it('should fetch subreddit information', async () => {
      const mockSubredditData = {
        data: {
          data: {
            display_name: 'programming',
            title: 'Programming',
            description: 'A subreddit for programming',
            public_description: 'Public description',
            subscribers: 1000000,
            active_user_count: 5000,
            created_utc: 1234567890,
            over18: false,
            subreddit_type: 'public',
            url: '/r/programming/'
          }
        }
      }

      // Mock authentication
      // @ts-expect-error - Mocking axios.post
      axios.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      })

      mockAxiosInstance.get.mockResolvedValue(mockSubredditData)

      const subreddit = await client.getSubredditInfo('programming')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/r/programming/about.json')
      expect(subreddit.displayName).toBe('programming')
      expect(subreddit.subscribers).toBe(1000000)
    })
  })

  describe('getTopPosts', () => {
    it('should fetch top posts from a subreddit', async () => {
      const mockPostsData = {
        data: {
          data: {
            children: [
              {
                data: {
                  id: 'post1',
                  title: 'Test Post 1',
                  author: 'author1',
                  subreddit: 'programming',
                  selftext: 'Post content',
                  url: 'https://reddit.com/r/programming/post1',
                  score: 100,
                  upvote_ratio: 0.95,
                  num_comments: 50,
                  created_utc: 1234567890,
                  over_18: false,
                  spoiler: false,
                  edited: false,
                  is_self: true,
                  link_flair_text: null,
                  permalink: '/r/programming/comments/post1/'
                }
              }
            ]
          }
        }
      }

      // Mock authentication
      // @ts-expect-error - Mocking axios.post
      axios.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      })

      mockAxiosInstance.get.mockResolvedValue(mockPostsData)

      const posts = await client.getTopPosts('programming', 'week', 10)

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/r/programming/top.json', {
        params: {
          t: 'week',
          limit: 10
        }
      })
      expect(posts).toHaveLength(1)
      expect(posts[0].id).toBe('post1')
      expect(posts[0].title).toBe('Test Post 1')
    })

    it('should fetch top posts from home when no subreddit specified', async () => {
      const mockPostsData = {
        data: {
          data: {
            children: []
          }
        }
      }

      // Mock authentication
      // @ts-expect-error - Mocking axios.post
      axios.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      })

      mockAxiosInstance.get.mockResolvedValue(mockPostsData)

      await client.getTopPosts('', 'day', 5)

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/top.json', {
        params: {
          t: 'day',
          limit: 5
        }
      })
    })
  })

  describe('createPost', () => {
    it('should create a new post', async () => {
      const mockSubmitResponse = {
        data: {
          success: true,
          data: {
            id: 'newpost123'
          }
        }
      }

      const mockPostData = {
        data: {
          data: {
            children: [{
              data: {
                id: 'newpost123',
                title: 'My New Post',
                author: 'testuser',
                subreddit: 'test',
                selftext: 'Post content',
                url: 'https://reddit.com/r/test/newpost123',
                score: 1,
                upvote_ratio: 1,
                num_comments: 0,
                created_utc: Date.now() / 1000,
                over_18: false,
                spoiler: false,
                edited: false,
                is_self: true,
                link_flair_text: null,
                permalink: '/r/test/comments/newpost123/'
              }
            }]
          }
        }
      }

      // Mock authentication
      // @ts-expect-error - Mocking axios.post
      axios.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      })

      mockAxiosInstance.post.mockResolvedValue(mockSubmitResponse)
      mockAxiosInstance.get.mockResolvedValue(mockPostData)

      const post = await client.createPost('test', 'My New Post', 'Post content')

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/submit',
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      )

      const postParams = mockAxiosInstance.post.mock.calls[0][1] as URLSearchParams
      expect(postParams.get('sr')).toBe('test')
      expect(postParams.get('kind')).toBe('self')
      expect(postParams.get('title')).toBe('My New Post')
      expect(postParams.get('text')).toBe('Post content')

      expect(post.id).toBe('newpost123')
      expect(post.title).toBe('My New Post')
    })

    it('should throw error when user is not authenticated', async () => {
      const clientReadOnly = new RedditClient({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        userAgent: 'TestApp/1.0.0'
      })

      // Mock authentication
      // @ts-expect-error - Mocking axios.post
      axios.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      })

      await expect(clientReadOnly.createPost('test', 'Title', 'Content'))
        .rejects.toThrow('User authentication required for posting')
    })
  })

  describe('replyToPost', () => {
    it('should reply to an existing post', async () => {
      const mockCheckResponse = {
        data: {
          data: {
            children: [{ data: { id: 'post123' } }]
          }
        }
      }

      const mockCommentResponse = {
        id: 'comment123',
        subreddit: 'test',
        link_title: 'Original Post Title',
        permalink: '/r/test/comments/post123/comment123'
      }

      // Mock authentication
      // @ts-expect-error - Mocking axios.post
      axios.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      })

      mockAxiosInstance.get.mockResolvedValue(mockCheckResponse)
      mockAxiosInstance.post.mockResolvedValue({ data: mockCommentResponse })

      const comment = await client.replyToPost('post123', 'Great post!')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/info.json?id=t3_post123')
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/comment',
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      )

      const commentParams = mockAxiosInstance.post.mock.calls[0][1] as URLSearchParams
      expect(commentParams.get('thing_id')).toBe('t3_post123')
      expect(commentParams.get('text')).toBe('Great post!')

      expect(comment.id).toBe('comment123')
      expect(comment.body).toBe('Great post!')
      expect(comment.author).toBe('testuser')
    })

    it('should throw error when post does not exist', async () => {
      const mockCheckResponse = {
        data: {
          data: {
            children: []
          }
        }
      }

      // Mock authentication
      // @ts-expect-error - Mocking axios.post
      axios.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      })

      mockAxiosInstance.get.mockResolvedValue(mockCheckResponse)

      await expect(client.replyToPost('nonexistent', 'Comment'))
        .rejects.toThrow('Failed to reply to post nonexistent')
    })
  })
})
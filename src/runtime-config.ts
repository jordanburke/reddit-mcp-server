import type { CredentialProvider } from "./credentials"

function readArg(name: string): string | undefined {
  const key = `--${name}`
  const index = process.argv.indexOf(key)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function readArgOrEnv(name: string, envName: string): string | undefined {
  const value = readArg(name) ?? process.env[envName]
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export type RuntimeConfig = {
  clientId?: string
  clientSecret?: string
  userAgent?: string
  username?: string
  password?: string
  authMode: "auto" | "authenticated" | "anonymous"
  safeMode: "off" | "standard" | "strict"
  credentialProvider: CredentialProvider
  gitCredentialHost: string
  gitCredentialClientSecretPath: string
  gitCredentialPasswordPath: string
  passCliCommand: string
  passCliClientSecretKey?: string
  passCliPasswordKey?: string
}

export function loadRuntimeConfig(): RuntimeConfig {
  const provider = (readArgOrEnv("credential-provider", "REDDIT_CREDENTIAL_PROVIDER") ||
    "git-credential") as CredentialProvider

  const usernameArg = readArg("username")
  const usernameEnv = process.env.REDDIT_USERNAME?.trim()
  const username = usernameArg || (provider === "env" ? usernameEnv : undefined)

  if (!usernameArg && usernameEnv && provider !== "env") {
    console.error(
      "[Security] REDDIT_USERNAME from environment is ignored for secure credential providers. Use --username (or plugin config reddit.username).",
    )
  }

  return {
    clientId: readArgOrEnv("client-id", "REDDIT_CLIENT_ID"),
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    userAgent: readArgOrEnv("user-agent", "REDDIT_USER_AGENT"),
    username,
    password: process.env.REDDIT_PASSWORD,
    authMode: (readArgOrEnv("auth-mode", "REDDIT_AUTH_MODE") || "auto") as RuntimeConfig["authMode"],
    safeMode: (readArgOrEnv("safe-mode", "REDDIT_SAFE_MODE") || "standard") as RuntimeConfig["safeMode"],
    credentialProvider: provider,
    gitCredentialHost: readArgOrEnv("git-credential-host", "REDDIT_GIT_CREDENTIAL_HOST") || "reddit.com",
    gitCredentialClientSecretPath:
      readArgOrEnv("git-credential-client-secret-path", "REDDIT_GIT_CREDENTIAL_CLIENT_SECRET_PATH") ||
      "oauth-client-secret",
    gitCredentialPasswordPath:
      readArgOrEnv("git-credential-password-path", "REDDIT_GIT_CREDENTIAL_PASSWORD_PATH") || "password",
    passCliCommand: readArgOrEnv("pass-cli-command", "REDDIT_PASS_CLI_COMMAND") || "pass-cli",
    passCliClientSecretKey: readArgOrEnv("pass-cli-client-secret-key", "REDDIT_PASS_CLI_CLIENT_SECRET_KEY"),
    passCliPasswordKey: readArgOrEnv("pass-cli-password-key", "REDDIT_PASS_CLI_PASSWORD_KEY"),
  }
}

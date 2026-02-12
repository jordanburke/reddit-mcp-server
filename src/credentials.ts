import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type CredentialProvider = "git-credential" | "pass-cli" | "env"

export type SecretConfig = {
  provider: CredentialProvider
  username?: string
  envClientSecret?: string
  envPassword?: string
  gitCredentialHost: string
  gitCredentialClientSecretPath: string
  gitCredentialPasswordPath: string
  passCliCommand: string
  passCliClientSecretKey?: string
  passCliPasswordKey?: string
}

async function gitCredentialFill(params: {
  host: string
  username: string
  path: string
}): Promise<Record<string, string>> {
  const input = `protocol=https\nhost=${params.host}\nusername=${params.username}\npath=${params.path}\n\n`

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn("git", ["credential", "fill"], { stdio: ["pipe", "pipe", "pipe"] })
    let output = ""
    let errors = ""

    child.stdout.on("data", (chunk) => {
      output += chunk.toString()
    })

    child.stderr.on("data", (chunk) => {
      errors += chunk.toString()
    })

    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`git credential fill failed (${code}): ${errors.trim() || "unknown error"}`))
        return
      }
      resolve(output)
    })

    child.stdin.write(input)
    child.stdin.end()
  })

  const result: Record<string, string> = {}
  for (const line of stdout.split(/\r?\n/)) {
    const idx = line.indexOf("=")
    if (idx > 0) {
      result[line.slice(0, idx)] = line.slice(idx + 1)
    }
  }
  return result
}

async function passCliSupportsSecretSubcommand(command: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(command, ["help"], { encoding: "utf8" })
    return /\bsecret\b/.test(stdout)
  } catch {
    return false
  }
}

async function passCliGet(command: string, key: string): Promise<string> {
  if (await passCliSupportsSecretSubcommand(command)) {
    const { stdout } = await execFileAsync(command, ["secret", "get", key], { encoding: "utf8" })
    return stdout.trim()
  }

  // Proton Pass CLI (current versions) does not expose `secret get`.
  // In that case we treat key as a pass URI and read it through `item view`.
  const { stdout } = await execFileAsync(command, ["item", "view", key], { encoding: "utf8" })
  return stdout.trim()
}

export async function resolveSecrets(config: SecretConfig): Promise<{ clientSecret?: string; password?: string }> {
  if (config.provider === "env") {
    return {
      clientSecret: config.envClientSecret,
      password: config.envPassword,
    }
  }

  if (!config.username) {
    throw new Error(
      `Credential provider '${config.provider}' requires reddit username via --username (or REDDIT_USERNAME for legacy compatibility).`,
    )
  }

  if (config.provider === "git-credential") {
    const [secretCred, passwordCred] = await Promise.all([
      gitCredentialFill({
        host: config.gitCredentialHost,
        username: config.username,
        path: config.gitCredentialClientSecretPath,
      }),
      gitCredentialFill({
        host: config.gitCredentialHost,
        username: config.username,
        path: config.gitCredentialPasswordPath,
      }),
    ])

    return {
      clientSecret: secretCred.password,
      password: passwordCred.password,
    }
  }

  if (!config.passCliClientSecretKey || !config.passCliPasswordKey) {
    throw new Error("pass-cli provider requires REDDIT_PASS_CLI_CLIENT_SECRET_KEY and REDDIT_PASS_CLI_PASSWORD_KEY")
  }

  const [clientSecret, password] = await Promise.all([
    passCliGet(config.passCliCommand, config.passCliClientSecretKey),
    passCliGet(config.passCliCommand, config.passCliPasswordKey),
  ])

  return { clientSecret, password }
}

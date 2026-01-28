#!/usr/bin/env tsx

/**
 * Version consistency checker
 * Ensures all version numbers across config files match package.json
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

interface PackageJson {
  version: string
  mcpName?: string
}

interface ServerJson {
  name: string
  version: string
  packages?: Array<{ version: string }>
}

interface ManifestJson {
  version: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..")

function readJSON<T>(filePath: string): T | null {
  const fullPath = path.join(ROOT, filePath)
  if (!fs.existsSync(fullPath)) {
    return null
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf-8")) as T
}

function main(): void {
  const pkg = readJSON<PackageJson>("package.json")
  const server = readJSON<ServerJson>("server.json")
  const manifest = readJSON<ManifestJson>("manifest.json")

  if (!pkg) {
    console.error("Could not read package.json")
    process.exit(1)
  }

  const expectedVersion = pkg.version
  const errors: string[] = []

  console.log(`\nChecking version consistency (expected: ${expectedVersion})\n`)

  // Check server.json
  if (server) {
    if (server.version !== expectedVersion) {
      errors.push(`server.json: version is "${server.version}" (expected "${expectedVersion}")`)
    }
    const pkgVersion = server.packages?.[0]?.version
    if (pkgVersion !== expectedVersion) {
      errors.push(`server.json: packages[0].version is "${pkgVersion}" (expected "${expectedVersion}")`)
    }
    console.log(
      `✓ server.json: ${server.version === expectedVersion && pkgVersion === expectedVersion ? "OK" : "MISMATCH"}`,
    )
  }

  // Check manifest.json
  if (manifest) {
    if (manifest.version !== expectedVersion) {
      errors.push(`manifest.json: version is "${manifest.version}" (expected "${expectedVersion}")`)
    }
    console.log(`✓ manifest.json: ${manifest.version === expectedVersion ? "OK" : "MISMATCH"}`)
  }

  // Check mcpName matches server.json name
  if (pkg.mcpName && server) {
    if (pkg.mcpName !== server.name) {
      errors.push(`package.json mcpName "${pkg.mcpName}" doesn't match server.json name "${server.name}"`)
    }
    console.log(`✓ mcpName consistency: ${pkg.mcpName === server.name ? "OK" : "MISMATCH"}`)
  }

  console.log("")

  if (errors.length > 0) {
    console.error("Version mismatches found:\n")
    errors.forEach((err) => console.error(`  ✗ ${err}`))
    console.error("\nPlease update all version numbers to match package.json\n")
    process.exit(1)
  }

  console.log("All versions are consistent!\n")
}

main()

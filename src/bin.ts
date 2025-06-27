#!/usr/bin/env node
import { RedditServer } from "./index"

const server = new RedditServer()
server.run().catch(console.error)

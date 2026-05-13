#!/usr/bin/env node

const { spawn } = require('node:child_process')

const env = { ...process.env }

;(async() => {
  // Build is already complete from the Dockerfile (standard `next build`).
  // Skip the experimental "generate" phase that fly's template runs by default —
  // it tries to prerender pages by fetching from BigQuery/HubSpot and times out.
  await exec(process.argv.slice(2).join(' '))
})()

function exec(command) {
  const child = spawn(command, { shell: true, stdio: 'inherit', env })
  return new Promise((resolve, reject) => {
    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} failed rc=${code}`))
      }
    })
  })
}

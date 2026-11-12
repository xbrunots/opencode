#!/usr/bin/env bun
import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { cp, readdir, stat } from "node:fs/promises"
import path from "node:path"

// Assemble only an already-built Windows package. Every run gets a fresh destination and never touches user data.
const repository = path.resolve(import.meta.dir, "../../..")
const source = path.join(repository, "dist", "desktop", "app")
const executables = (await readdir(source)).filter((name) => name.toLowerCase().endsWith(".exe"))
if (executables.length !== 1)
  throw new Error(`Expected one desktop executable in ${source}, found ${executables.length}`)
const cli = path.join(source, "resources", "opencode-cli.exe")
if (!(await stat(cli)).isFile() || !(await stat(cli)).size) throw new Error(`Missing bundled CLI: ${cli}`)
const cliVersion = (await Bun.file(path.join(source, "resources", "opencode-cli.version")).text()).trim()
if (!cliVersion) throw new Error("The packaged CLI has no version")
if (process.env.OPENCODE_VERSION && process.env.OPENCODE_VERSION !== cliVersion)
  throw new Error(`Expected CLI ${process.env.OPENCODE_VERSION}, found ${cliVersion}`)

const created = new Date().toISOString()
const identity = `${created.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`
const output = path.join(repository, "dist", `portable-local-${identity}`)
await cp(source, output, { recursive: true, force: false, errorOnExist: true })
await Bun.write(
  path.join(output, "portable.json"),
  JSON.stringify({ format: "opencode-portable", version: 1 }, null, 2) + "\n",
)
const pkg = await Bun.file(path.join(repository, "packages", "desktop", "package.json")).json()
await Bun.write(
  path.join(output, "README-portable.txt"),
  `OpenCode — pacote portátil local\nIdentificação: ${identity}\nVersão base: ${pkg.version}\n\nExecute ${executables[0]}. Dados locais serão criados em data/ ao lado do executável. Este pacote não substitui a instalação existente nem o portable anterior. Os hashes SHA-256 dos arquivos empacotados estão em portable-build.json.\n`,
)

const files: Record<string, string> = {}
for (const name of await readdir(output, { recursive: true })) {
  const file = path.join(output, name)
  if (!(await stat(file)).isFile()) continue
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  files[name.replaceAll("\\", "/")] = hash.digest("hex")
}
await Bun.write(
  path.join(output, "portable-build.json"),
  JSON.stringify({ identity, created, version: pkg.version, cliVersion, executable: executables[0], files }, null, 2) +
    "\n",
)
console.log(`Portable local: ${output}`)

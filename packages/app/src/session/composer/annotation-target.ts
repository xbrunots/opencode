export function matchesAnnotationTarget(
  note: { serverID?: string; sessionID: string },
  target: { serverID: string; sessionID?: string },
) {
  return !!note.serverID && note.serverID === target.serverID && note.sessionID === target.sessionID
}

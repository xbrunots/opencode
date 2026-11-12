/** Automatic motion selections are context metadata, not transcript notices. */
export const isAutomaticMotionSkill = (id: string) => id.startsWith("opencodex-motion:")

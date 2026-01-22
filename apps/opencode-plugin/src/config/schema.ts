import { z } from "zod"

export const gptersConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  preferPlanMode: z.boolean().default(true),
  autoCommit: z.boolean().default(true),
  branchGuard: z.boolean().default(true),
})

export type GptersConfig = z.infer<typeof gptersConfigSchema>

export const DEFAULT_CONFIG: GptersConfig = {
  version: 1,
  preferPlanMode: true,
  autoCommit: true,
  branchGuard: true,
}

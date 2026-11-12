import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

const text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(16_384))

export const HtmlPreview = Ipc.define({
  id: "file.preview",
  methods: {
    open: {
      input: Schema.Struct({ server: text, session: text, path: text }),
      output: Schema.Struct({ id: text }),
    },
    close: { input: Schema.Struct({ id: text }) },
  },
})

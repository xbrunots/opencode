import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

const text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(16_384))

export const HtmlPreview = Ipc.define({
  id: "file.preview",
  methods: {
    open: {
      input: Schema.Struct({ server: text, session: text, path: text, inline: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4 * 1024 * 1024))) }),
      output: Schema.Struct({ id: text }),
    },
    inspect: {
      input: Schema.Struct({ id: text, x: Schema.Finite, y: Schema.Finite, width: Schema.Finite, height: Schema.Finite, screenshot: Schema.optionalKey(Schema.Boolean) }),
      output: Schema.NullOr(Schema.Struct({
        selector: Schema.String,
        tag: Schema.String,
        component: Schema.optionalKey(Schema.String),
        html: Schema.String,
        text: Schema.String,
        rect: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, width: Schema.Finite, height: Schema.Finite }),
        source: Schema.optionalKey(Schema.Struct({ path: Schema.String, line: Schema.Number, confidence: Schema.Literals(["exact", "inferred"]) })),
      })),
    },
    freeze: { input: Schema.Struct({ id: text, active: Schema.Boolean }) },
    close: { input: Schema.Struct({ id: text }) },
  },
})

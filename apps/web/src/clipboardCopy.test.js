import assert from "node:assert/strict";
import test from "node:test";

import { writeClipboardText } from "./clipboardCopy.js";

test("writes text with navigator clipboard when available", async () => {
  const writes = [];

  const ok = await writeClipboardText("hello", {
    navigator: {
      clipboard: {
        writeText: async text => writes.push(text)
      }
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(writes, ["hello"]);
});

test("falls back to a temporary textarea when clipboard api is unavailable", async () => {
  const created = [];
  const body = {
    appended: [],
    removed: [],
    appendChild(element) {
      this.appended.push(element);
    },
    removeChild(element) {
      this.removed.push(element);
    }
  };
  const document = {
    body,
    createElement(tagName) {
      const element = {
        tagName,
        style: {},
        value: "",
        setAttribute(name, value) {
          this[name] = value;
        },
        select() {
          this.selected = true;
        }
      };
      created.push(element);
      return element;
    },
    execCommand(command) {
      return command === "copy";
    }
  };

  const ok = await writeClipboardText("hello", { document });

  assert.equal(ok, true);
  assert.equal(created[0].tagName, "textarea");
  assert.equal(created[0].value, "hello");
  assert.equal(created[0].selected, true);
  assert.deepEqual(body.appended, [created[0]]);
  assert.deepEqual(body.removed, [created[0]]);
});

test("uses copy event clipboard data before textarea fallback", async () => {
  const events = {};
  const document = {
    addEventListener(type, handler) {
      events[type] = handler;
    },
    removeEventListener(type) {
      delete events[type];
    },
    execCommand(command) {
      if (command !== "copy") return false;
      events.copy?.({
        clipboardData: {
          setData(type, value) {
            this.type = type;
            this.value = value;
          }
        },
        preventDefault() {
          this.defaultPrevented = true;
        }
      });
      return true;
    }
  };

  const ok = await writeClipboardText("hello", { document });

  assert.equal(ok, true);
  assert.equal(events.copy, undefined);
});

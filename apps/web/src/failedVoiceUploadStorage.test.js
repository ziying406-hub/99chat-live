import assert from "node:assert/strict";
import test from "node:test";

import { createFailedVoiceUploadStorage } from "./failedVoiceUploadStorage.js";

function createFakeIndexedDB() {
  const records = new Map();
  return {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          transaction() {
            const transaction = {
              objectStore() {
                return {
                  put(value) { records.set(value.id, value); },
                  delete(id) { records.delete(id); },
                  getAll() {
                    const getRequest = {};
                    queueMicrotask(() => {
                      getRequest.result = [...records.values()];
                      getRequest.onsuccess?.();
                    });
                    return getRequest;
                  }
                };
              },
              oncomplete: null,
              onerror: null
            };
            queueMicrotask(() => transaction.oncomplete?.());
            return transaction;
          }
        };
        request.onsuccess?.();
      });
      return request;
    }
  };
}

test("stores failed voice blobs and retry metadata across storage instances", async () => {
  const indexedDB = createFakeIndexedDB();
  const first = createFailedVoiceUploadStorage(indexedDB);
  const record = {
    id: "pending-voice-1",
    conversationId: "conversation-a",
    file: new Blob(["audio"], { type: "audio/mp4" }),
    message: { id: "pending-voice-1", type: "voice", body: "2", sendStatus: "failed", retryPayload: { type: "voice", body: "2" } }
  };

  await first.put(record);
  const restored = await createFailedVoiceUploadStorage(indexedDB).getAll();

  assert.deepEqual(restored.map(({ id, conversationId, message }) => ({ id, conversationId, message })), [{
    id: "pending-voice-1",
    conversationId: "conversation-a",
    message: record.message
  }]);
  assert.equal(await restored[0].file.text(), "audio");
});

test("removes a persisted failed voice record after successful retry", async () => {
  const storage = createFailedVoiceUploadStorage(createFakeIndexedDB());
  await storage.put({ id: "pending-voice-1", conversationId: "conversation-a", file: new Blob(["audio"]), message: {} });

  await storage.delete("pending-voice-1");

  assert.deepEqual(await storage.getAll(), []);
});

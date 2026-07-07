import assert from "node:assert/strict";
import test from "node:test";
import { uploadErrorMessage, validateSignedUpload } from "./uploadErrors.js";

test("upload errors translate backend size and empty file messages", () => {
  assert.equal(uploadErrorMessage(new Error("file exceeds 64MB")), "上传失败：文件不能超过 64MB");
  assert.equal(uploadErrorMessage(new Error("cannot upload empty file")), "上传失败：不能发送空文件");
});

test("upload errors translate backend path and storage messages", () => {
  assert.equal(uploadErrorMessage(new Error("missing file id or name")), "上传失败：文件地址不完整");
  assert.equal(uploadErrorMessage(new Error("invalid file path")), "上传失败：文件地址无效");
  assert.equal(uploadErrorMessage(new Error("upload directory failed")), "上传失败：上传目录创建失败");
  assert.equal(uploadErrorMessage(new Error("file create failed")), "上传失败：文件保存失败");
  assert.equal(uploadErrorMessage(new Error("file already exists")), "上传失败：文件已存在，请重新选择");
});

test("upload errors translate unsupported request methods", () => {
  assert.equal(uploadErrorMessage(new Error("method not allowed")), "上传失败：请求方式不支持");
});

test("upload errors translate invalid request payloads", () => {
  assert.equal(uploadErrorMessage(new Error("invalid json")), "上传失败：请求数据格式错误");
});

test("upload errors translate missing files", () => {
  assert.equal(uploadErrorMessage(new Error("not found")), "上传失败：文件不存在或已失效");
});

test("upload errors parse json backend error bodies", () => {
  assert.equal(uploadErrorMessage(new Error('{"error":"file upload failed"}')), "上传失败：文件上传失败");
});

test("upload errors fall back to api startup hint", () => {
  assert.equal(uploadErrorMessage(new Error("")), "上传失败：请确认 API 已启动");
});

test("signed upload validation requires upload and public urls", () => {
  assert.deepEqual(
    validateSignedUpload(
      { id: "file-1", uploadUrl: "/api/files/upload/file-1/a.png", publicUrl: "/uploads/file-1/a.png", mimeType: "image/jpeg" },
      "application/octet-stream"
    ),
    { ok: true, mimeType: "image/jpeg" }
  );
  assert.deepEqual(validateSignedUpload({ id: "file-1", uploadUrl: "" }), {
    ok: false,
    message: "文件上传准备失败"
  });
});

test("signed upload validation falls back to client mime type", () => {
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-1/a.bin", publicUrl: "/uploads/file-1/a.bin" }, "application/octet-stream"),
    { ok: true, mimeType: "application/octet-stream" }
  );
});

test("signed upload validation rejects unexpected url prefixes", () => {
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "api/files/upload/file-1/a.png", publicUrl: "/uploads/file-1/a.png" }),
    { ok: false, message: "文件上传准备失败" }
  );
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-1/a.png", publicUrl: "https://example.com/a.png" }),
    { ok: false, message: "文件上传准备失败" }
  );
});

test("signed upload validation rejects mismatched file ids", () => {
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-2/a.png", publicUrl: "/uploads/file-1/a.png" }),
    { ok: false, message: "文件上传准备失败" }
  );
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-1/a.png", publicUrl: "/uploads/file-2/a.png" }),
    { ok: false, message: "文件上传准备失败" }
  );
});

test("signed upload validation rejects extra path segments", () => {
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-1/extra/a.png", publicUrl: "/uploads/file-1/a.png" }),
    { ok: false, message: "文件上传准备失败" }
  );
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-1/a.png", publicUrl: "/uploads/file-1/extra/a.png" }),
    { ok: false, message: "文件上传准备失败" }
  );
});

test("signed upload validation rejects mismatched file names", () => {
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-1/a.png", publicUrl: "/uploads/file-1/b.png" }),
    { ok: false, message: "文件上传准备失败" }
  );
});

test("signed upload validation rejects query strings and hashes", () => {
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-1/a.png?token=1", publicUrl: "/uploads/file-1/a.png?token=1" }),
    { ok: false, message: "文件上传准备失败" }
  );
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-1/a.png#preview", publicUrl: "/uploads/file-1/a.png#preview" }),
    { ok: false, message: "文件上传准备失败" }
  );
});

test("signed upload validation rejects unsafe file names", () => {
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-1/bad name.txt", publicUrl: "/uploads/file-1/bad name.txt" }),
    { ok: false, message: "文件上传准备失败" }
  );
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-1/bad@name.txt", publicUrl: "/uploads/file-1/bad@name.txt" }),
    { ok: false, message: "文件上传准备失败" }
  );
});

test("signed upload validation rejects file names with edge dots", () => {
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-1/.env", publicUrl: "/uploads/file-1/.env" }),
    { ok: false, message: "文件上传准备失败" }
  );
  assert.deepEqual(
    validateSignedUpload({ id: "file-1", uploadUrl: "/api/files/upload/file-1/a.", publicUrl: "/uploads/file-1/a." }),
    { ok: false, message: "文件上传准备失败" }
  );
});

test("signed upload validation rejects non file ids", () => {
  assert.deepEqual(
    validateSignedUpload({ id: "avatar-1", uploadUrl: "/api/files/upload/avatar-1/a.png", publicUrl: "/uploads/avatar-1/a.png" }),
    { ok: false, message: "文件上传准备失败" }
  );
});

test("signed upload validation rejects empty file id suffixes", () => {
  assert.deepEqual(
    validateSignedUpload({ id: "file-", uploadUrl: "/api/files/upload/file-/a.png", publicUrl: "/uploads/file-/a.png" }),
    { ok: false, message: "文件上传准备失败" }
  );
});

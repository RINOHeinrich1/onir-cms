import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptAttribute,
  attachmentsHtml,
  canAddFiles,
  fileFields,
  formatFileSize,
  maxFiles,
} from "../src/lib/attachments.js";

const cv = {
  name: "cv",
  label: "CV",
  type: "file",
  required: true,
  accept: ["application/pdf"],
  maxFiles: 1,
  maxBytes: 2 * 1024 * 1024,
};

test("fileFields ne garde que les champs fichier", () => {
  assert.deepEqual(fileFields([{ name: "nom", type: "text" }, cv]), [cv]);
  assert.deepEqual(fileFields(null), []);
});

test("accept et limites du champ fichier", () => {
  assert.equal(acceptAttribute(cv), "application/pdf");
  assert.equal(maxFiles(cv), 1);
  assert.equal(maxFiles({}), 1);
});

test("canAddFiles applique type, taille et nombre", () => {
  const ok = canAddFiles(cv, [], [{ name: "cv.pdf", type: "application/pdf", size: 1024 }]);
  assert.equal(ok.ok, true);
  assert.equal(
    canAddFiles(cv, [], [{ name: "cv.png", type: "image/png", size: 1024 }]).ok,
    false,
  );
  assert.equal(
    canAddFiles(cv, [], [{ name: "cv.pdf", type: "application/pdf", size: 3 * 1024 * 1024 }]).ok,
    false,
  );
  const already = [{ id: "a", fieldName: "cv" }];
  assert.equal(
    canAddFiles(cv, already, [{ name: "cv.pdf", type: "application/pdf", size: 1024 }]).ok,
    false,
  );
});

test("formatFileSize et liens de message", () => {
  assert.equal(formatFileSize(1024), "1 Ko");
  assert.equal(formatFileSize(2 * 1024 * 1024), "2.0 Mo");
  const html = attachmentsHtml([
    {
      id: "a1",
      fieldName: "cv",
      fieldLabel: "CV",
      originalName: "cv & notes.pdf",
      mime: "application/pdf",
      sizeBytes: 1024,
      url: "https://example.com/cv.pdf?x=1&y=2",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  assert.match(html, /cv &amp; notes\.pdf/);
  assert.match(html, /href="https:\/\/example\.com\/cv\.pdf\?x=1&amp;y=2"/);
  assert.equal(attachmentsHtml([]), "");
});

export interface CRDTChar {
  id: string;         // Format: "userID:logicalClock"
  char: string;       // Character value (can support multi-byte characters/emojis)
  after_id: string;   // ID of the preceding character
  is_deleted: boolean; // Tombstone marker
}

export interface Op {
  id: string;
  doc_id: string;
  user_id: string;
  op_type: "insert" | "delete";
  char_id: string;
  char: string;
  after_id: string;
  is_deleted: boolean;
  vector_clock?: Record<string, number>;
  created_at?: string;
}

export class CRDTDoc {
  docID: string;
  chars: CRDTChar[];

  constructor(docID: string, chars: CRDTChar[] = []) {
    this.docID = docID;
    this.chars = chars;
  }

  getActiveChars(): CRDTChar[] {
    return this.chars.filter(c => !c.is_deleted);
  }

  toText(): string {
    return this.chars
      .filter(c => !c.is_deleted)
      .map(c => c.char)
      .join("");
  }

  apply(op: Op) {
    if (op.op_type === "insert") {
      this.insert(op);
    } else if (op.op_type === "delete") {
      this.delete(op);
    }
  }

  insert(op: Op) {
    // Avoid double-insertion
    if (this.chars.some(c => c.id === op.char_id)) {
      return;
    }

    const newChar: CRDTChar = {
      id: op.char_id,
      char: op.char,
      after_id: op.after_id,
      is_deleted: false,
    };

    // 1. Locate the baseline position
    let insertIdx = -1;
    if (op.after_id) {
      insertIdx = this.chars.findIndex(c => c.id === op.after_id);
      if (insertIdx === -1) {
        insertIdx = this.chars.length - 1;
      }
    }

    // 2. Resolve concurrent sibling inserts (RGA scan forward)
    let scanIdx = insertIdx + 1;
    const skipped: Record<string, boolean> = {};

    while (scanIdx < this.chars.length) {
      const curr = this.chars[scanIdx];
      const isSibling = curr.after_id === op.after_id;
      const isDescendant = skipped[curr.after_id];

      if (isSibling || isDescendant) {
        // Tie-break: sort by ID lexicographically (descending order)
        if (isDescendant || curr.id > op.char_id) {
          skipped[curr.id] = true;
          scanIdx++;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    // 3. Insert character node at the resolved index
    this.chars.splice(scanIdx, 0, newChar);
  }

  delete(op: Op) {
    const charNode = this.chars.find(c => c.id === op.char_id);
    if (charNode) {
      charNode.is_deleted = true;
    }
  }
}

// Helper to generate a UUID v4
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Generate insert operations for a position in the active CRDT sequence
export function generateInsertOps(
  doc: CRDTDoc,
  activeIndex: number,
  textToInsert: string,
  userID: string,
  nextClock: () => number
): Op[] {
  const activeChars = doc.getActiveChars();
  let afterID = "";
  if (activeIndex > 0 && activeChars[activeIndex - 1]) {
    afterID = activeChars[activeIndex - 1].id;
  }

  const normalized = textToInsert.replace(/&nbsp;/gi, "\u00A0");
  const runes = Array.from(normalized);
  const ops: Op[] = [];

  for (const r of runes) {
    const charID = `${userID}:${nextClock()}`;
    ops.push({
      id: generateUUID(),
      doc_id: doc.docID,
      user_id: userID,
      op_type: "insert",
      char_id: charID,
      char: r,
      after_id: afterID,
      is_deleted: false,
      created_at: new Date().toISOString()
    });
    afterID = charID;
  }

  return ops;
}

// Generate delete operations for a range of characters in the active CRDT sequence
export function generateDeleteOps(
  doc: CRDTDoc,
  activeIndex: number,
  lengthToDelete: number,
  userID: string
): Op[] {
  const activeChars = doc.getActiveChars();
  const deletedNodes = activeChars.slice(activeIndex, activeIndex + lengthToDelete);
  const ops: Op[] = [];

  for (const charNode of deletedNodes) {
    ops.push({
      id: generateUUID(),
      doc_id: doc.docID,
      user_id: userID,
      op_type: "delete",
      char_id: charNode.id,
      char: "",
      after_id: "",
      is_deleted: true,
      created_at: new Date().toISOString()
    });
  }

  return ops;
}

// Optimized diffing algorithm for instant responsive typing
export function diffAndGenerateOps(
  oldDoc: CRDTDoc,
  oldText: string,
  newText: string,
  userID: string,
  nextClock: () => number
): Op[] {
  const normalizedOld = oldText.includes("&nbsp;") ? oldText.replace(/&nbsp;/gi, "\u00A0") : oldText;
  const normalizedNew = newText.includes("&nbsp;") ? newText.replace(/&nbsp;/gi, "\u00A0") : newText;

  const oldLen = normalizedOld.length;
  const newLen = normalizedNew.length;

  // Find common prefix length using string character code comparisons
  let prefixLen = 0;
  while (
    prefixLen < oldLen &&
    prefixLen < newLen &&
    normalizedOld.charCodeAt(prefixLen) === normalizedNew.charCodeAt(prefixLen)
  ) {
    prefixLen++;
  }

  // Find common suffix length
  let suffixLen = 0;
  while (
    suffixLen < oldLen - prefixLen &&
    suffixLen < newLen - prefixLen &&
    normalizedOld.charCodeAt(oldLen - 1 - suffixLen) === normalizedNew.charCodeAt(newLen - 1 - suffixLen)
  ) {
    suffixLen++;
  }

  const deletedCount = oldLen - prefixLen - suffixLen;
  const insertedString = normalizedNew.substring(prefixLen, newLen - suffixLen);

  const ops: Op[] = [];
  const activeChars = oldDoc.getActiveChars();

  // 1. Delete Operations
  if (deletedCount > 0) {
    const deletedNodes = activeChars.slice(prefixLen, prefixLen + deletedCount);
    const nowIso = new Date().toISOString();
    for (let i = 0; i < deletedNodes.length; i++) {
      ops.push({
        id: generateUUID(),
        doc_id: oldDoc.docID,
        user_id: userID,
        op_type: "delete",
        char_id: deletedNodes[i].id,
        char: "",
        after_id: "",
        is_deleted: true,
        created_at: nowIso
      });
    }
  }

  // 2. Insert Operations
  if (insertedString.length > 0) {
    let afterID = "";
    if (prefixLen > 0 && activeChars[prefixLen - 1]) {
      afterID = activeChars[prefixLen - 1].id;
    }

    const insertedRunes = Array.from(insertedString);
    const nowIso = new Date().toISOString();
    for (let i = 0; i < insertedRunes.length; i++) {
      const r = insertedRunes[i];
      const charID = `${userID}:${nextClock()}`;
      ops.push({
        id: generateUUID(),
        doc_id: oldDoc.docID,
        user_id: userID,
        op_type: "insert",
        char_id: charID,
        char: r,
        after_id: afterID,
        is_deleted: false,
        created_at: nowIso
      });
      afterID = charID;
    }
  }

  return ops;
}

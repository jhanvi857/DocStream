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
      // Fallback if parent not found
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

// O(N) diffing algorithm using common prefix/suffix matching
export function diffAndGenerateOps(
  oldDoc: CRDTDoc,
  oldText: string,
  newText: string,
  userID: string,
  nextClock: () => number
): Op[] {
  // Find common prefix length
  let prefixLen = 0;
  while (
    prefixLen < oldText.length &&
    prefixLen < newText.length &&
    oldText[prefixLen] === newText[prefixLen]
  ) {
    prefixLen++;
  }

  // Find common suffix length
  let suffixLen = 0;
  while (
    suffixLen < oldText.length - prefixLen &&
    suffixLen < newText.length - prefixLen &&
    oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const deletedText = oldText.slice(prefixLen, oldText.length - suffixLen);
  const insertedText = newText.slice(prefixLen, newText.length - suffixLen);

  const ops: Op[] = [];

  // 1. Generate Delete Operations
  if (deletedText.length > 0) {
    const activeChars = oldDoc.getActiveChars();
    const deletedActiveChars = activeChars.slice(prefixLen, activeChars.length - suffixLen);

    for (const charNode of deletedActiveChars) {
      ops.push({
        id: `op-${userID}-${Date.now()}-${nextClock()}`,
        doc_id: oldDoc.docID,
        user_id: userID,
        op_type: "delete",
        char_id: charNode.id,
        char: "",
        after_id: "",
        is_deleted: true,
      });
    }
  }

  // 2. Generate Insert Operations
  if (insertedText.length > 0) {
    const activeChars = oldDoc.getActiveChars();
    // The insertion parent is the character node preceding the insert index
    let afterID = "";
    if (prefixLen > 0 && activeChars[prefixLen - 1]) {
      afterID = activeChars[prefixLen - 1].id;
    }

    // Generate insert operation per character
    for (let i = 0; i < insertedText.length; i++) {
      const char = insertedText[i];
      const charID = `${userID}:${nextClock()}`;
      ops.push({
        id: `op-${userID}-${Date.now()}-${nextClock()}`,
        doc_id: oldDoc.docID,
        user_id: userID,
        op_type: "insert",
        char_id: charID,
        char: char,
        after_id: afterID,
        is_deleted: false,
      });
      // The subsequent characters are chained sequentially
      afterID = charID;
    }
  }

  return ops;
}

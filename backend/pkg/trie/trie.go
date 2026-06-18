package trie

import (
	"container/list"
	"sort"
	"sync"
)

// Suggestion represents a suggestion result with its associated frequency.
type Suggestion struct {
	Word      string `json:"word"`
	Frequency int64  `json:"frequency"`
}

// Node represents a single character node in the Trie.
type Node struct {
	Char      rune           `json:"char"`
	Children  map[rune]*Node `json:"children"`
	Frequency int64          `json:"frequency"`
	Word      string         `json:"word"` // Stores full word if this is a terminating node
}

func NewNode(char rune) *Node {
	return &Node{
		Char:     char,
		Children: make(map[rune]*Node),
	}
}

// Trie implements a thread-safe prefix search tree with bounded memory and LRU eviction.
type Trie struct {
	root     *Node
	mu       sync.RWMutex
	maxWords int
	wordMap  map[string]*list.Element
	lruList  *list.List
}

func NewTrie(maxWords int) *Trie {
	return &Trie{
		root:     NewNode(0),
		maxWords: maxWords,
		wordMap:  make(map[string]*list.Element),
		lruList:  list.New(),
	}
}

func (t *Trie) Insert(word string) {
	if word == "" {
		return
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	t.insertUnlocked(word, 1, false)
}

func (t *Trie) Select(word string) {
	if word == "" {
		return
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	t.insertUnlocked(word, 1, true)
}

// insertUnlocked helper executes the insertion logic.
// It assumes the write lock t.mu is already held.
// If increment is true, it increments the frequency if the word exists.
func (t *Trie) insertUnlocked(word string, initialFreq int64, increment bool) {
	runes := []rune(word)
	curr := t.root

	for _, r := range runes {
		next, exists := curr.Children[r]
		if !exists {
			next = NewNode(r)
			curr.Children[r] = next
		}
		curr = next
	}

	isNewWord := curr.Frequency == 0

	if isNewWord {
		if t.maxWords > 0 && len(t.wordMap) >= t.maxWords {
			t.evictOldestUnlocked()
		}
		curr.Frequency = initialFreq
		curr.Word = word

		elem := t.lruList.PushFront(word)
		t.wordMap[word] = elem
	} else {
		if increment {
			curr.Frequency++
		}
		// Update LRU access order
		if elem, exists := t.wordMap[word]; exists {
			t.lruList.MoveToFront(elem)
		} else {
			// Fallback in case LRU tracking was out of sync
			elem := t.lruList.PushFront(word)
			t.wordMap[word] = elem
		}
	}
}

// remove the least recently used word.
func (t *Trie) evictOldestUnlocked() {
	backElem := t.lruList.Back()
	if backElem == nil {
		return
	}

	wordToEvict := backElem.Value.(string)
	t.lruList.Remove(backElem)
	delete(t.wordMap, wordToEvict)

	t.pruneUnlocked(wordToEvict)
}

// traverse the path for a word and remove unused nodes.
func (t *Trie) pruneUnlocked(word string) {
	runes := []rune(word)
	nodes := make([]*Node, len(runes)+1)
	nodes[0] = t.root

	curr := t.root
	for i, r := range runes {
		next, exists := curr.Children[r]
		if !exists {
			return
		}
		nodes[i+1] = next
		curr = next
	}
	curr.Frequency = 0
	curr.Word = ""

	// Traverse backwards and delete redundant nodes
	for i := len(runes); i > 0; i-- {
		node := nodes[i]
		parent := nodes[i-1]

		if node.Frequency == 0 && len(node.Children) == 0 {
			delete(parent.Children, runes[i-1])
		} else {
			break
		}
	}
}

// return the top limit ranked suggestions for a given prefix.
func (t *Trie) Suggest(prefix string, limit int) []Suggestion {
	if limit <= 0 {
		return nil
	}

	t.mu.RLock()
	runes := []rune(prefix)
	curr := t.root
	for _, r := range runes {
		next, exists := curr.Children[r]
		if !exists {
			t.mu.RUnlock()
			return nil
		}
		curr = next
	}

	var candidates []Suggestion
	t.collectSuggestions(curr, &candidates)
	t.mu.RUnlock()

	// Sort candidates by frequency descending, using alphabetical order as tie-breaker.
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].Frequency == candidates[j].Frequency {
			return candidates[i].Word < candidates[j].Word
		}
		return candidates[i].Frequency > candidates[j].Frequency
	})

	if len(candidates) > limit {
		return candidates[:limit]
	}
	return candidates
}

// recursively find all terminating words under a node.
func (t *Trie) collectSuggestions(node *Node, suggestions *[]Suggestion) {
	if node == nil {
		return
	}
	if node.Frequency > 0 {
		*suggestions = append(*suggestions, Suggestion{
			Word:      node.Word,
			Frequency: node.Frequency,
		})
	}
	for _, child := range node.Children {
		t.collectSuggestions(child, suggestions)
	}
}

func (t *Trie) Size() int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return len(t.wordMap)
}

// returns the frequency of a word, or 0 if it doesn't exist.
func (t *Trie) GetWordFrequency(word string) int64 {
	t.mu.RLock()
	defer t.mu.RUnlock()

	runes := []rune(word)
	curr := t.root
	for _, r := range runes {
		next, exists := curr.Children[r]
		if !exists {
			return 0
		}
		curr = next
	}
	return curr.Frequency
}

// word and its frequency for serialization.
type SnapshotEntry struct {
	Word      string `json:"word"`
	Frequency int64  `json:"frequency"`
}

// return words and freq in LRU order.
func (t *Trie) ExportWords() []SnapshotEntry {
	t.mu.RLock()
	defer t.mu.RUnlock()

	entries := make([]SnapshotEntry, 0, t.lruList.Len())
	for elem := t.lruList.Back(); elem != nil; elem = elem.Prev() {
		word := elem.Value.(string)

		runes := []rune(word)
		curr := t.root
		found := true
		for _, r := range runes {
			next, exists := curr.Children[r]
			if !exists {
				found = false
				break
			}
			curr = next
		}

		if found && curr.Frequency > 0 {
			entries = append(entries, SnapshotEntry{
				Word:      word,
				Frequency: curr.Frequency,
			})
		}
	}
	return entries
}

func (t *Trie) LoadSnapshot(entries []SnapshotEntry) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.root = NewNode(0)
	t.wordMap = make(map[string]*list.Element)
	t.lruList = list.New()

	for _, entry := range entries {
		t.insertUnlocked(entry.Word, entry.Frequency, false)
	}
}

package trie

import (
	"sort"
)

// FuzzySuggest returns suggestions matching the prefix with up to 1 edit distance.
// It prioritizes exact prefix matches if they exist, then adds fuzzy matches.
func (t *Trie) FuzzySuggest(prefix string, limit int) []Suggestion {
	if limit <= 0 {
		return nil
	}

	t.mu.RLock()
	defer t.mu.RUnlock()

	runes := []rune(prefix)
	if len(runes) == 0 {
		// Empty prefix, fallback to standard suggest
		t.mu.RUnlock()
		res := t.Suggest("", limit)
		t.mu.RLock()
		return res
	}

	// We use a map to find all matching destination nodes for fuzzy prefixes.
	// Map key is the actual matching prefix string, value is the Trie node.
	matchingNodes := make(map[string]*Node)
	
	// Start recursive fuzzy search from root
	t.fuzzySearch(t.root, runes, 0, 1, nil, matchingNodes)

	// Collect suggestions from all matching nodes, deduplicating by word.
	suggestMap := make(map[string]int64)
	for _, node := range matchingNodes {
		var candidates []Suggestion
		t.collectSuggestions(node, &candidates)
		for _, cand := range candidates {
			if freq, exists := suggestMap[cand.Word]; !exists || cand.Frequency > freq {
				suggestMap[cand.Word] = cand.Frequency
			}
		}
	}

	// Convert deduplicated map to slice
	var results []Suggestion
	for word, freq := range suggestMap {
		results = append(results, Suggestion{
			Word:      word,
			Frequency: freq,
		})
	}

	// Sort results:
	// We rank by frequency descending, then alphabetical as a tie-breaker.
	sort.Slice(results, func(i, j int) bool {
		if results[i].Frequency == results[j].Frequency {
			return results[i].Word < results[j].Word
		}
		return results[i].Frequency > results[j].Frequency
	})

	if len(results) > limit {
		return results[:limit]
	}
	return results
}

// fuzzySearch recursively searches the Trie allowing up to 'edits' errors.
// results maps the matching prefix string -> terminating Node of that prefix.
func (t *Trie) fuzzySearch(node *Node, runes []rune, idx int, edits int, path []rune, results map[string]*Node) {
	if edits < 0 || node == nil {
		return
	}

	// If we've reached the end of the input prefix
	if idx == len(runes) {
		results[string(path)] = node
		// If we still have an edit left, we can also insert any child character
		if edits > 0 {
			for r, child := range node.Children {
				results[string(append(path, r))] = child
			}
		}
		return
	}

	currRune := runes[idx]

	// 1. Exact Match (cost = 0 edits)
	if child, exists := node.Children[currRune]; exists {
		t.fuzzySearch(child, runes, idx+1, edits, append(path, currRune), results)
	}

	// If we have edits remaining, branch out to edit distance 1 operations
	if edits > 0 {
		// 2. Substitution: replace input rune with any child character
		for r, child := range node.Children {
			if r != currRune {
				t.fuzzySearch(child, runes, idx+1, edits-1, append(path, r), results)
			}
		}

		// 3. User deletion (skip input rune, stay on same Trie node)
		t.fuzzySearch(node, runes, idx+1, edits-1, path, results)

		// 4. User insertion (consume any child character, stay on same input rune)
		for r, child := range node.Children {
			t.fuzzySearch(child, runes, idx, edits-1, append(path, r), results)
		}

		// 5. Transposition (swap adjacent runes)
		if idx+1 < len(runes) {
			nextRune := runes[idx+1]
			if childNext, exists := node.Children[nextRune]; exists {
				if childCurr, exists := childNext.Children[currRune]; exists {
					t.fuzzySearch(childCurr, runes, idx+2, edits-1, append(path, nextRune, currRune), results)
				}
			}
		}
	}
}

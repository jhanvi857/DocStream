package trie

import (
	"testing"
)

func TestFuzzySuggest(t *testing.T) {
	tr := NewTrie(10)

	tr.Insert("apple")
	tr.Insert("apricot")
	tr.Insert("banana")
	tr.Insert("berry")

	// 1. Exact/Fuzzy match: 'app' is exact for 'apple' and fuzzy (1 edit: p->r) for 'apr' (apricot)
	s := tr.FuzzySuggest("app", 5)
	if len(s) != 2 {
		t.Fatalf("Expected 2 suggestions ('apple', 'apricot'), got: %v", s)
	}
	if !containsWord(s, "apple") || !containsWord(s, "apricot") {
		t.Errorf("Expected suggestions to contain 'apple' and 'apricot', got: %v", s)
	}

	// 2. Substitution: 'apq' -> 'app' (apple) or 'apr' (apricot)
	s = tr.FuzzySuggest("apq", 5)
	if len(s) != 2 {
		t.Fatalf("Expected 2 suggestions for 'apq', got: %v", s)
	}
	if !containsWord(s, "apple") || !containsWord(s, "apricot") {
		t.Errorf("Expected suggestions to contain 'apple' and 'apricot', got: %v", s)
	}

	// 3. Insertion: 'aple' -> 'apple' (missing 'p' in input)
	s = tr.FuzzySuggest("aple", 5)
	if len(s) != 1 || s[0].Word != "apple" {
		t.Errorf("Expected insertion match 'apple', got: %v", s)
	}

	// 4. Deletion: 'appple' -> 'apple' (extra 'p' in input)
	s = tr.FuzzySuggest("appple", 5)
	if len(s) != 1 || s[0].Word != "apple" {
		t.Errorf("Expected deletion match 'apple', got: %v", s)
	}

	// 5. Transposition: 'appel' -> 'apple' (swapped 'e' and 'l')
	s = tr.FuzzySuggest("appel", 5)
	if len(s) != 1 || s[0].Word != "apple" {
		t.Errorf("Expected transposition match 'apple', got: %v", s)
	}
}

func TestFuzzySuggestMultiple(t *testing.T) {
	tr := NewTrie(10)

	tr.Insert("apple")
	tr.Insert("apricot")
	tr.Insert("banana")
	
	// Increment banana's frequency to rank it higher
	tr.Select("banana")
	tr.Select("banana") // frequency = 3

	// Input 'banan' matches 'banana' exactly
	// Input 'banax' (edit distance 1 substitution) matches 'banana'
	s := tr.FuzzySuggest("banax", 5)
	if len(s) != 1 || s[0].Word != "banana" || s[0].Frequency != 3 {
		t.Errorf("Expected fuzzy match 'banana' with frequency 3, got: %v", s)
	}
}

func containsWord(suggestions []Suggestion, word string) bool {
	for _, s := range suggestions {
		if s.Word == word {
			return true
		}
	}
	return false
}

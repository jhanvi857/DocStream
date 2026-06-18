package trie

import (
	"testing"
)

func TestTrieBasicInsertAndSuggest(t *testing.T) {
	tr := NewTrie(10)

	tr.Insert("apple")
	tr.Insert("app")
	tr.Insert("apricot")
	tr.Insert("banana")

	// Verify size
	if tr.Size() != 4 {
		t.Errorf("Expected size 4, got %d", tr.Size())
	}

	// Basic suggest for "ap"
	s := tr.Suggest("ap", 5)
	if len(s) != 3 {
		t.Fatalf("Expected 3 suggestions for prefix 'ap', got %d", len(s))
	}

	// Should be sorted alphabetically initially since all frequencies are 1
	expected := []string{"app", "apple", "apricot"}
	for i, val := range expected {
		if s[i].Word != val {
			t.Errorf("Expected suggestion %d to be %s, got %s", i, val, s[i].Word)
		}
	}
}

func TestTrieRanking(t *testing.T) {
	tr := NewTrie(10)

	tr.Insert("apple")
	tr.Insert("app")
	tr.Insert("apricot")

	// Increment frequencies
	tr.Select("apricot")
	tr.Select("apricot") // apricot frequency = 3
	tr.Select("apple")   // apple frequency = 2
	// app frequency remains 1

	s := tr.Suggest("ap", 5)
	if len(s) != 3 {
		t.Fatalf("Expected 3 suggestions, got %d", len(s))
	}

	// Should be ranked by frequency descending
	if s[0].Word != "apricot" || s[0].Frequency != 3 {
		t.Errorf("Expected top suggestion to be apricot with freq 3, got %s with freq %d", s[0].Word, s[0].Frequency)
	}
	if s[1].Word != "apple" || s[1].Frequency != 2 {
		t.Errorf("Expected second suggestion to be apple with freq 2, got %s with freq %d", s[1].Word, s[1].Frequency)
	}
	if s[2].Word != "app" || s[2].Frequency != 1 {
		t.Errorf("Expected third suggestion to be app with freq 1, got %s with freq %d", s[2].Word, s[2].Frequency)
	}
}

func TestTrieEviction(t *testing.T) {
	// Trie with max 3 words
	tr := NewTrie(3)

	tr.Insert("one")
	tr.Insert("two")
	tr.Insert("three")

	if tr.Size() != 3 {
		t.Fatalf("Expected size 3, got %d", tr.Size())
	}

	// "one" is oldest. Let's insert a fourth word, which should trigger eviction of "one"
	tr.Insert("four")

	if tr.Size() != 3 {
		t.Errorf("Expected size to remain 3 after eviction, got %d", tr.Size())
	}

	if tr.GetWordFrequency("one") != 0 {
		t.Errorf("Expected 'one' to be evicted and have frequency 0")
	}

	// Verify "four", "three", "two" are present
	if tr.GetWordFrequency("four") != 1 || tr.GetWordFrequency("three") != 1 || tr.GetWordFrequency("two") != 1 {
		t.Errorf("Expected remaining words to have frequency 1")
	}
}

func TestTrieLRUOrdering(t *testing.T) {
	tr := NewTrie(3)

	tr.Insert("one")
	tr.Insert("two")
	tr.Insert("three")

	// "one" is oldest. Let's Select "one" to make it Most Recently Used.
	tr.Select("one")

	// Now "two" is the oldest. Let's insert "four", which should evict "two".
	tr.Insert("four")

	if tr.GetWordFrequency("two") != 0 {
		t.Errorf("Expected 'two' to be evicted")
	}
	if tr.GetWordFrequency("one") != 2 { // initial 1 + select 1 = 2
		t.Errorf("Expected 'one' to remain with frequency 2, got %d", tr.GetWordFrequency("one"))
	}
}

func TestTrieNodePruning(t *testing.T) {
	tr := NewTrie(2)

	// "dog" and "cat"
	tr.Insert("dog")
	tr.Insert("cat")

	// Get dog frequency (1)
	if tr.GetWordFrequency("dog") != 1 {
		t.Errorf("Expected dog to be present")
	}

	// Evict "dog" by inserting "cow"
	tr.Insert("cow")

	if tr.GetWordFrequency("dog") != 0 {
		t.Errorf("Expected dog to be evicted")
	}

	// Let's verify that the nodes for "dog" are fully pruned from root.
	// Since 'd' is no longer in children of root, root.Children['d'] should be nil.
	tr.mu.RLock()
	defer tr.mu.RUnlock()
	if _, exists := tr.root.Children['d']; exists {
		t.Errorf("Expected node 'd' to be pruned from root children")
	}
}

func TestTrieNodePruningPartial(t *testing.T) {
	tr := NewTrie(2)

	// "apple" and "apricot" share prefix "ap"
	tr.Insert("apple")
	tr.Insert("apricot")

	// Evict "apple" by inserting "banana"
	tr.Insert("banana")

	if tr.GetWordFrequency("apple") != 0 {
		t.Errorf("Expected 'apple' to be evicted")
	}

	tr.mu.RLock()
	defer tr.mu.RUnlock()

	// 'a' -> 'p' -> 'r' -> 'i' ... should still exist (for apricot)
	// 'a' -> 'p' -> 'p' -> 'l' -> 'e' should be pruned from 'p' onwards
	aNode, exists := tr.root.Children['a']
	if !exists {
		t.Fatalf("Expected 'a' to exist")
	}
	pNode, exists := aNode.Children['p']
	if !exists {
		t.Fatalf("Expected 'ap' to exist")
	}

	// 'p' child of 'p' (from apple) should be pruned
	if _, exists := pNode.Children['p']; exists {
		t.Errorf("Expected child 'p' of prefix 'ap' to be pruned")
	}

	// 'r' child of 'p' (from apricot) should still exist
	if _, exists := pNode.Children['r']; !exists {
		t.Errorf("Expected child 'r' of prefix 'ap' to exist for 'apricot'")
	}
}

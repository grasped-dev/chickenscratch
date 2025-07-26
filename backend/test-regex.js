const text = 'br0wn f0x d0g';
const regex = /0(?=[a-z])/gi;

console.log('Original text:', text);
console.log('Regex matches:', text.match(regex));
console.log('After replacement:', text.replace(regex, 'o'));

// Test individual cases
console.log('br0wn -> ', 'br0wn'.replace(/0(?=[a-z])/gi, 'o'));
console.log('f0x -> ', 'f0x'.replace(/0(?=[a-z])/gi, 'o'));
console.log('d0g -> ', 'd0g'.replace(/0(?=[a-z])/gi, 'o'));
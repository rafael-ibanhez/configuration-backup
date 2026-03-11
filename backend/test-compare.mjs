// Verbose test to debug the compare endpoint
const res = await fetch('http://localhost:3000/api/hardware-trees/compare?model=FA14%2F17-MKII&from_version=V3.6.23&to_version=V3.7.2');
const data = await res.json();

if (data.error) { console.log('ERROR:', data.error); process.exit(1); }

console.log('from tree:', data.from ? 'id=' + data.from.id + ' ver=' + data.from.software_version + ' rootNodes=' + (data.from.nodes?.length ?? 0) : 'NULL');
console.log('to tree:  ', data.to   ? 'id=' + data.to.id   + ' ver=' + data.to.software_version   + ' rootNodes=' + (data.to.nodes?.length ?? 0)   : 'NULL');
console.log('Summary:', JSON.stringify(data.summary));

console.log('\nRemoved (' + data.diff.removed.length + '):');
data.diff.removed.forEach(d => console.log('  ' + d.path.join(' > ') + '  addr=' + (d.node.address_dec ?? 'null') + '  desc=' + d.node.description));

console.log('\nAdded (' + data.diff.added.length + '):');
data.diff.added.slice(0, 15).forEach(d => console.log('  ' + d.path.join(' > ') + '  addr=' + (d.node.address_dec ?? 'null') + '  desc=' + d.node.description));
if (data.diff.added.length > 15) console.log('  ...and ' + (data.diff.added.length - 15) + ' more');

console.log('\nModified (' + data.diff.modified.length + '):');
data.diff.modified.forEach(d => {
  console.log('  ' + d.path.join(' > ') + (d.moved ? ' [MOVED]' : ''));
  d.changes.forEach(c => console.log('    ' + c.field + ': ' + JSON.stringify(c.from) + ' -> ' + JSON.stringify(c.to)));
});

// ============================================================
//  app.js  --  what happens after the name is accepted
// ============================================================
//  The keyboard collects a name and fires one event. This file is the
//  seam v3..v6.2 left open on purpose: it turns that name into the four
//  values the generator takes, and hands them to DNA.
//
//      name  --NameDNA.toValues-->  [v,v,v,v] in -1..1
//            --DNA.create-->        a stored entry + 'dna:committed'
//            --collection.js-->     a butterfly flown into the kaleidoscope
//
//  Nothing else here. The mapping is in name-dna.js, storage is in
//  dna-store.js, and the butterfly is collection.js's job. This file
//  just connects them.
// ============================================================
window.addEventListener('keyboard:accepted', function (e) {
  var name = e.detail && e.detail.name;
  var values = NameDNA.toValues(name);
  if (!values) {
    // nothing was spelled -- the keyboard should not have let this
    // through (accept() refuses an empty name), so just note it and stop
    console.warn('[butterfly-keyboard] accepted an empty name; no butterfly made');
    return;
  }
  var entry = DNA.create(values, {
    name: NameDNA.clean(name),
    source: 'butterfly-keyboard',
    channel: 'name'
  });
  console.log('[butterfly-keyboard] "' + NameDNA.clean(name) + '" -> butterfly #' +
              (entry ? entry.id : '?'));
});

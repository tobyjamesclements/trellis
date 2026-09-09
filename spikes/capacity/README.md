# Spike 1.7: box capacity

**Question.** Can the box hold five hundred content documents of mixed size
and a log of two hundred thousand signed records in automerge-repo within
1.5 GiB and fold the log cold in under thirty seconds, and how do Ed25519
verification back ends compare?

**Method.** `npm install` bundles the shared core; `npm run generate` builds
the data set through automerge-repo over the NodeFS storage adapter with the
platform's own record format and writers (500 text documents: 100 of 1 KiB,
300 of 10 KiB, 80 of 100 KiB, 20 of 1 MiB; one class log of 200,000
enrolment records from eight teacher devices, 71 MiB of record bytes);
`npm run bench` cold-loads it and folds the log. Because the log did not
load, `node bench-scaling.mjs` repeats the exercise at 25,000, 50,000, and
100,000 records and `node bench-append.mjs` times single-record appends. Each
was run with Node 22 and Bun 1.3 on an Intel Xeon at 2.8 GHz (x86_64
container, 15 GiB RAM).

## Results

**The 200,000-record document does not load.** Generation held it (peak
1.7 GiB in the generating process), but a fresh process could not load it
back: Automerge's WASM module ran out of memory while applying the changes,
in Node and in Bun alike. One log document of that size is beyond Automerge
3.4 on any hardware.

**Log documents, Node 22** (build in changes of 500 records):

| Records | Build   | Snapshot | Load snapshot | automerge-repo cold load | Full fold (Web Crypto) |
| ------- | ------- | -------- | ------------- | ------------------------ | ---------------------- |
| 25,000  | 2.1 s   | 5 MiB    | 0.27 s        | 0.62 s (+52 MiB)         | 1.9 s                  |
| 50,000  | 5.3 s   | 9 MiB    | 0.50 s        | 1.25 s (+85 MiB)         | 4.3 s                  |
| 100,000 | 19.9 s  | 18 MiB   | 1.35 s        | 3.4 s (+270 MiB)         | 8.9 s                  |

**One more record on a large log, Node 22** (the cost every device pays per
chat message or enrolment):

| Records in the log | Single append (median) | Sync change size | automerge-repo incremental save |
| ------------------ | ---------------------- | ---------------- | ------------------------------- |
| 1,000              | 0.7 ms                 | 513 bytes        | 8.7 KiB                         |
| 10,000             | 5.1 ms                 | 513 bytes        | 74 KiB                          |
| 25,000             | 15 ms                  | 515 bytes        | 123 KiB                         |
| 50,000             | 35 ms                  | 515 bytes        | 206 KiB                         |
| 100,000            | 93 ms                  | 519 bytes        | 414 KiB                         |

Sync traffic stays at the size of the record. The cost of applying a change
and the bytes automerge-repo writes to storage for it both grow with the
document: at 100,000 records every appended record costs the box a tenth of
a second and 400 KiB of flash writes.

**Content documents** (Automerge text; load time per document, Node 22):

| Size    | Load per document | Memory per document |
| ------- | ----------------- | ------------------- |
| 1 KiB   | 3.4 ms            | 0.4 MiB             |
| 10 KiB  | 10 ms             | 0.2 MiB             |
| 100 KiB | 94 ms             | 1 MiB               |
| 1 MiB   | 983 ms            | 14 MiB              |

Text costs about a millisecond per kibibyte to load and fourteen times its
size in memory, because every character is an operation.

**Ed25519 verification, 20,000 signatures:**

| Back end                                   | Node 22       | Bun 1.3      |
| ------------------------------------------ | ------------- | ------------ |
| Web Crypto, batches of 128 (thread pool)   | 27,174 /s     | 4,163 /s     |
| Web Crypto, one at a time                  | 5,360 /s      | 2,911 /s     |
| libsodium (WASM, synchronous)              | 7,010 /s      | 4,946 /s     |
| @noble/ed25519 (pure JavaScript)           | 463 /s        | 67 /s        |

**Bun versus Node.** Bun loaded documents at the same speed but signed six
times slower, folded three to four times slower (100,000 records: 40.5 s
against 8.9 s), and its Web Crypto gains almost nothing from batching. Its
peak memory was higher throughout (3.4 GiB against 2.4 GiB for the whole
scaling run). On this workload Node is the better runtime.

## What the design takes from this

1. **Epochs are not optional and must be small.** A class log should be sealed
   well before 25,000 records; a few thousand keeps appends under a
   millisecond and storage writes under 10 KiB per record. Chat is the log
   most likely to grow, so it needs sealing by count or by age, whichever
   comes first. This is class-state-log's "Epoch compaction" with a number
   attached.
2. **Content document budgets belong around 100 KiB of text**, with media in
   bundles as the specs already say; a 1 MiB text document is a second of
   load and 14 MiB of memory on this machine, several times that on a Pi.
3. **Keep the fold's batched Web Crypto verification**; it beats the WASM
   and JavaScript alternatives by a wide margin and scales with cores. A
   WASM verifier is only a fallback for a runtime whose Web Crypto is slow.
4. **Open question 7 leans to Node** on crypto throughput and memory; the
   single-executable packaging of native addons (the HTTP/3 server) is the
   remaining factor.
5. **Memory budgets should count operations, not bytes**: a log document
   costs two to three times its snapshot in memory, a text document fourteen
   times its text.

## What the rig still has to answer

The Pi 5's own numbers. Its Cortex-A76 cores are two to three times slower
than this Xeon on single-threaded work and there are four of them, so the
times above are a lower bound; memory sizes carry over. Storage adapter and
filesystem choices (task 1.8) also change the cold-load figures.

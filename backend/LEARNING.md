QUIC
Web socket does the similar thing so it's better to use websockets.
1. Gather requirements
- functional requirements : user should do CRUD operations.
    - Multiple users should be able to concurrently edit the same doc.
    - updates should be visible in real time.
    - cursor position - IMP to avoid conflicts.
    - Auth, file sharing etc
- Non functional requirements.
    - Millions of documents.
    - how many users can concurrently use doc at one time - upto 100 concurrent users per doc. same as google doc.
    - Latency should be <=200 ms.
    - document to converge/consistency.
    - Avg doc size = 100KB

2. API and database design.
    - POST : /api/documents 
    - GET : /api/documents/{documentId}
    - PUT : /api/documents/{documentId}
    - WS : /api/documents/{documentId}/collaborate.

-  client -> API gateway ->document service, web sockets ->object storage(to actually store documents coz of massive large docs so better to store here in a blob store rather than db), database

client ---> CDN ---> object storage

- if want to read doc only then it's kinda static thing so we can go from client-->CDN-->object storeage and read.
- now we want to edit doc and store into object store then it's not possible coz object storage is gonna create a new file so we have to send entire doc even for one line editing. so we're going to send only edits. we're gonna use database to store edits so dual approach both db and object storage.
- edit approaches. 
    1. send whole doc
    2. send only edited stuff.
    3. Last write wins
    4. Operational transform
    5. CRDT : conflict free replication data types
 

### conflicts.
- consistency of client is very IMP.
- suppose hello! -> index 0,1,2,3,4,5.
insert(",",5)
insert(" world",5)
first insert was sent first to our server so we're gonna update the string to hello,! now when second insert is being processed then the string will be hello world,! which is wrong. coz we sent edits.
- how we solve it ? using operational transform. What it'll do is that it'll transform a second request to insert(" world",6) coz there was one character inserted so offset is 1
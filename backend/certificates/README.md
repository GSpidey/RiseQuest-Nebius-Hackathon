# Apple receipt-verification trust anchors

`backend/src/storeBilling.js` loads these public DER root certificates when initializing Apple's signed-data verifiers. Apple publishes them at https://www.apple.com/certificateauthority/.

| File | SHA-256 fingerprint |
| --- | --- |
| AppleRootCA-G2.cer | C2B9B042DD57830E7D117DAC55AC8AE19407D38E41D88F3215BC3A890444A050 |
| AppleRootCA-G3.cer | 63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179 |

Check with `openssl x509 -inform DER -in AppleRootCA-G2.cer -noout -subject -issuer -fingerprint -sha256`, and repeat for G3. Private signing keys and account credentials are supplied separately by each developer.

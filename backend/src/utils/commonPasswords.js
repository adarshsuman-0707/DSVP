/**
 * Small built-in deny-list of the most common passwords / base words. This is
 * a first, offline line of defence; the k-anonymity breach check
 * (services/breachCheck.js) covers the long tail.
 * Entries are lowercase letters/digits only — candidates are normalised the
 * same way before lookup (see passwordPolicy.looksCommon).
 */
const WORDS = `
password passw0rd pass word123 qwerty qwertyuiop qwertyuiopasdfghjkl asdfgh asdfghjkl zxcvbn zxcvbnm
letmein welcome welcome1 admin administrator root toor login logon master superuser changeme changeit
iloveyou iloveu monkey dragon football baseball basketball soccer hockey golf tennis
sunshine princess shadow superman batman spiderman starwars pokemon naruto
trustno1 whatever freedom secret secure private access hello hellothere hi
abc123 abcd1234 abcdefg abcdefgh abcdefghi abcdefghijkl 123456 1234567 12345678 123456789 1234567890 12345678910
111111 000000 123123 654321 696969 121212 112233 123321 123qwe 1q2w3e 1q2w3e4r 1q2w3e4r5t 1qaz2wsx qazwsx qazwsxedc zaq12wsx
charlie donald michael jordan jennifer jessica ashley daniel thomas robert andrew joshua matthew
summer winter spring autumn january february march april may june july august september october november december
computer internet google facebook youtube twitter instagram netflix amazon microsoft apple samsung
cricket india india123 delhi mumbai bollywood
default guest test testing tester test123 demo sample example user username
dsvp datastructure datastructures visualization visualizer algorithm algorithms
lovely loveyou love123 forever angel angels killer hunter ranger tigger buster
passwordpassword passwordpasswordpassword
`.split(/\s+/).filter(Boolean);

module.exports = new Set(WORDS);

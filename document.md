# SkillRack Program Tracker — solved / pending

> Live tracker maintained by `tools/status.py`. A problem is **SOLVED** when a
> verified `solutions/<ProgramID>.md` exists in this repo.
>
> The userscript fetches these **by ProgramID** from this repo **by default**:
> `https://raw.githubusercontent.com/ToonTamilIndia/skillrack-userscript/main/solutions/<id>.md`
> (GitHub raw URL — works for everyone, no server needed). For dev/testing, point
> Settings → "Solutions Base URL" at a local server, e.g. `http://localhost:3000`
> (run `node solutions-server.js`); AI is the final fallback.
>
> All solved problems are **C**. Level 1 (CODETUTOR pack 0) covers the 50
> VERY-EASY / EASY / ADD-ON / AVERAGE / practice / video sets; **Level 3 (MNC
> Companies) is fully solved (207/207)**. Levels 2 and 4 are enumerated but
> unsolved; Levels 5/6/Prime are wallet-gated kits and expose no problem IDs.

## Current status

- **Solved (committed solution file exists):** 390
- **Level 3 — MNC Companies (CODETRACK lev=3): 207/207 SOLVED** — COGNIZANT CTS
  35 PROGRAMS (10) and MNC COMPANIES PROGRAMS SET 001-020 (197). All verified:
  151 auto-verified against sample I/O (`tools/verify.py`), 49 function-style
  harness-verified, 7 CTS function problems without samples sanity-checked.
- **Enumerated with a live session cookie (`tools/.scratch/enum/`):** Level 1 C pack = 543
  unique problems; Level 2 = 5; Level 3 = 207; Level 4 = 25. **Levels 5/6/Prime are
  wallet-gated kits** — they expose only a names-only preview, so unsolved IDs must be
  captured from the `viewsolved` / solve pages rather than the kit list.
- **Pending:** Level 2 (5 Recursion problems), Level 4 (25 DSA problems) and the
  remaining Level 1 packs (Java / Python / C++ / SQL / DS-C / DS-Java) are the next
  solve targets (`tools/enum.py <idx>` / `tools/fetchlev.py`, see skill.md §1).

## Language coverage

| Lang | Solutions |
|------|-----------|
| C | 390 |

## Pack / level inventory

| Level | Content | Status |
|-------|---------|--------|
| 1 — CODETUTOR | 7 language packs (C / Java / Python / C++ / SQL / DS-C / DS-Java); each pack = ~23 sub-challenges incl. INTRO, STARTER, 50 VERY-EASY, 50 EASY, 50 EASY ADD-ON, 50 AVERAGE, LAB ADD-ON; some problems are MFIB fill-in-the-blank | 🔄 C sets SOLVED (183 files); rest ⏳ |
| 2 — CODETRACK lev=2 | KICKSTART for ABSOLUTE Beginner → **Recursion** sub-challenge (5 unsolved) | ⏳ 5 unsolved enumerated |
| 3 — CODETRACK lev=3 | MNC Companies (TCS/CTS/WIPRO/INFOSYS): COGNIZANT CTS - 35 PROGRAMS (10) · InfyTQ Programs (all solved) · MNC COMPANIES PROGRAMS (SET 001-020, 197) | 🔄 **207/207 SOLVED** |
| 4 — CODETRACK lev=4 | Data Structures & Algorithms — Stack / Queue / Binary Tree / Sorting (25 unsolved) | ⏳ 25 unsolved enumerated |
| 5 — CODETRACK lev=5 | Product Companies (Higher Salary) — **wallet-gated KIT**; page shows a names-only "Programs List" preview (Step Number [ZH], Array LEADERS (ZH), …) with **no problem IDs**; scheduling needs wallet points (balance 0) | 🔒 wallet-gated — capture IDs from `viewsolved`/solve pages instead |
| 6 — CODETRACK lev=6 | Dream Product Companies (Very High Salary) + Mini Projects — **wallet-gated KIT**, names-only preview | 🔒 wallet-gated |
| Prime — CODETRACK lev=100 | Dream Companies Placement Pack — **wallet-gated KIT**, names-only preview | 🔒 wallet-gated |
| LACS — webinarcodetrack | Webinar code track | ⏳ PENDING |
| LAB — labcodeprograms | LAB programs | ⏳ PENDING |

## All solved problems (390)

| Id | Problem | Lang |
|----|---------|------|
| 11865 | function addTwoIntegers | c |
| 11866 | function getVowelsCount | c |
| 11867 | function addThreeIntegers | c |
| 11868 | function getIndex | c |
| 11869 | function getOddCount | c |
| 11870 | function getCommonFactorsCount | c |
| 11871 | function getFactorsCount | c |
| 11872 | function getAlphabetsCount | c |
| 11873 | function getFactorial | c |
| 11874 | function compareLength | c |
| 12058 | function findSequence | c |
| 12075 | function countHardPrograms | c |
| 12155 | Washing Machine | c |
| 12182 | Trains - Departure Time | c |
| 12186 | function customCaesarCipher | c |
| 12188 | Car Parking - Park & Search | c |
| 12220 | Invalid Mobile Numbers | c |
| 12221 | Water Tank & Buckets | c |
| 12234 | Physical Fitness Test | c |
| 12235 | Chocolate Vending Machine | c |
| 12236 | Wall Painting Cost | c |
| 12237 | Metro Train Fare | c |
| 12238 | Fully Automatic Vending Machine | c |
| 12239 | Exam Seating Arrangement | c |
| 12254 | Cricket Tournament | c |
| 12255 | Count & Remove Vowels | c |
| 12268 | Team Selection - Height | c |
| 12269 | Bunch of Room Keys | c |
| 12270 | Most Favorite Place in India | c |
| 12276 | Fibonacci Series - Count Odd & Even | c |
| 12283 | Count Characters & Words | c |
| 12284 | Walls Reconstruction - Strictly Increasing Order | c |
| 12330 | Generate Key | c |
| 12331 | Decode Digital Lock | c |
| 12332 | Swap Every Two Digits | c |
| 12333 | Count of Non-repeated Characters | c |
| 12334 | Sum of Non-prime Digits | c |
| 12339 | Count Unique Words | c |
| 12340 | Barcode Number - Old ID | c |
| 12341 | Minimum Profit - N days | c |
| 12342 | Smallest Integer - Product of Digits | c |
| 12343 | Shortest & Second Shortest Distance | c |
| 12350 | function findMaxDifference | c |
| 12351 | function calculateTotalTax | c |
| 12353 | function findOddEvenDifference | c |
| 12354 | Maximum Length - 0s or 1s | c |
| 12355 | Most Frequent Alphabet - Substrings | c |
| 12356 | Area of Largest House | c |
| 12366 | Customer & Queries | c |
| 12373 | Count Submatrices - Product K | c |
| 12500 | Possible Ways - Consecutive 1s | c |
| 12501 | Flower Sticks - Bouquet | c |
| 12502 | Smart Undercover Agent | c |
| 12511 | Nuclear Reaction - Total Energy | c |
| 12512 | Robber & Gold Boxes | c |
| 12513 | Chemical Mixture - Explosion Rate | c |
| 12541 | Digits Sum Starts with D | c |
| 13043 | File - Characters at Odd Positions | c |
| 13057 | function mergeFileContents | c |
| 13059 | function mergeTwoArrays | c |
| 14120 | Minimum Nurses to Vaccinate People | c |
| 14152 | Eye Checkup Camp | c |
| 14164 | Hiring a Car - Travel Cost | c |
| 14166 | Camel Case to Normal Sentence | c |
| 14168 | Find Selling Price - Product Label | c |
| 14169 | Find Missing Alphabets | c |
| 14173 | Sports Car Racing | c |
| 14182 | String - Alphabets, Digits or Both | c |
| 14183 | Count 2s - Prime Factors | c |
| 14184 | Maximum Sum - Integer with Index | c |
| 14186 | Steps & Jumps Game | c |
| 14187 | Integers within Range | c |
| 14188 | Reverse String - Preserve Digits | c |
| 14194 | Cricket Tournament - Maximum Matches | c |
| 14196 | Remove Digit - Maximum Possible Integer | c |
| 14197 | Slide Left Subarray | c |
| 14235 | Picnic - Maximum Groups | c |
| 14236 | Placement Season - Problem Solving Capability | c |
| 14246 | Three Integers Key | c |
| 14247 | function remainderMod11 | c |
| 14248 | function bitwise | c |
| 14252 | Pizza Delivery Boy | c |
| 14253 | function replaceAlternateWords | c |
| 14254 | function multiplyBy11 | c |
| 14258 | Next Letter Equal Distance | c |
| 14275 | Unique Characters Number | c |
| 14276 | Minimum Penalty Absolute Diff | c |
| 14351 | Maximum Electrostatic Field | c |
| 14354 | Sort Characters by Frequency | c |
| 14355 | function calcTotalTax | c |
| 14358 | Total Coins - Row and Column | c |
| 14360 | Validate Coupon Code | c |
| 14361 | function messageEncryptionKey | c |
| 14363 | Calculate Player's Score | c |
| 14366 | Minimum MaxMin Difference | c |
| 14369 | Efficient Carry Weight Bags | c |
| 14371 | Count Digits - Exclude D | c |
| 14372 | Total Enemies Destroyed - Sniper Game | c |
| 14374 | Chocolate Strength | c |
| 14376 | Longest Substring Length - K Distinct Vowels | c |
| 14377 | Nth Special Number | c |
| 14379 | Game with Multiplication | c |
| 14382 | Cyclic Increasing Array or Not | c |
| 14384 | Neon Number | c |
| 14387 | Multiples with Happy and Coding | c |
| 14388 | Number to Open Next Level | c |
| 14390 | function findNextGreater | c |
| 14395 | Increasing Diagonals Pattern | c |
| 14396 | Numberic Code to Alphabetic Code | c |
| 14398 | Key - Largest & Second Largest Digits | c |
| 14400 | function createNum | c |
| 14402 | Check Stock & Place Order | c |
| 14403 | Two Integers - Minimum Sum | c |
| 14411 | Jingo Lottery Game | c |
| 14412 | Square Shaped Plots | c |
| 14413 | Two Highest Selling Products | c |
| 14414 | Weather Today | c |
| 14415 | Robot - Pick Steel Rods | c |
| 14416 | Sum - Each Integer | c |
| 14417 | function shiftCipher | c |
| 14418 | Cubic Bricks | c |
| 14419 | Find Credit Score | c |
| 14420 | function findNthTerm - GP | c |
| 14422 | function countDearrangements | c |
| 14423 | function getMaxRowColSum | c |
| 14424 | function getMinimumMoves | c |
| 14425 | Calculate Commission - Marketing Organization | c |
| 14426 | Hotel - Order Food Online | c |
| 14427 | Membership Discount | c |
| 14428 | Clever Monkeys | c |
| 14429 | Doctor - Consultation Fees | c |
| 14430 | TV - Exchange Offer | c |
| 14431 | Toy Shop | c |
| 14432 | Reverse Binary in 32-Bit | c |
| 14437 | function countCommonCharacters | c |
| 14439 | function findLargestDistance | c |
| 14440 | ASCII Shift Encryption | c |
| 14444 | Cricket Balls | c |
| 14455 | function isPerfectPalindrome | c |
| 14457 | function magicalArray | c |
| 14458 | function findNextTerm | c |
| 14462 | Alt+Tab Window | c |
| 14464 | function distributeChocolates | c |
| 14466 | function countDistinctYears | c |
| 14468 | Power of 2 | c |
| 14469 | Sort Items by Risk Values | c |
| 14470 | Copper Wires - Minimum Cost | c |
| 14472 | Crossings Count - Vehicles | c |
| 14473 | Odd Frequency - Colourful Balls | c |
| 14474 | Booking Ad - All Slots | c |
| 14475 | Floors - Even Frequency | c |
| 14476 | Maximum Guests - Meeting Hall | c |
| 14477 | Encrypt Message | c |
| 14479 | Alphabets or Digit Sum | c |
| 14482 | function countFascinatingNumbers | c |
| 14483 | function customSpellCheck | c |
| 14484 | Parking Lot - Most Filled Row | c |
| 14485 | function getRemainder | c |
| 14486 | Split Chocolates - Equal Weight | c |
| 14487 | Quadruplets - Maximum Value | c |
| 14488 | function findSubarrayUniqueCountSum | c |
| 14489 | Mixture - Find Milk Quantity | c |
| 14490 | Supermarket - Last Customer Waiting Time | c |
| 14491 | Two Series - Common Term | c |
| 14493 | Choose Blue and Black Pens | c |
| 14494 | Rescue People from Heavy Rain | c |
| 14495 | Count Houses - Electricity | c |
| 14496 | Sum of Digits - T times | c |
| 14497 | Find Box Number - Counting Puzzle | c |
| 14498 | All Combinations - Odd or Even | c |
| 14499 | Clothes - Maximum Count | c |
| 14500 | Food Item - Maximum Product | c |
| 14501 | String - Asterisk/Hash | c |
| 14502 | Find Coupon Code - Winners | c |
| 14503 | function validateMessage | c |
| 14504 | Gift Hamper | c |
| 14505 | Find Price - Costliest Jewelry Set | c |
| 14506 | Transactions - Debit after Credit | c |
| 14507 | Pairs of Students | c |
| 14508 | Count Potatoes Used | c |
| 14509 | First & Last Occurrences of First | c |
| 14510 | function findTotalFeet | c |
| 14511 | Perfect City | c |
| 14512 | Count Even Sum Subarray | c |
| 14513 | Integers - Occurrence Count | c |
| 14514 | function removeIntegersRecursively | c |
| 14515 | Even Frequency Sum | c |
| 14516 | Collect Maximum Fruits | c |
| 14517 | function containsKDigits | c |
| 14518 | Maximum Flower Plants - Garden | c |
| 14519 | Split String - N Parts | c |
| 14520 | Pollution Control Rule - Total Fine | c |
| 14521 | Break Integer - Maximum Product | c |
| 14522 | Electricity Bill Amount | c |
| 14524 | Difference - Every Two Adjacent Digits | c |
| 14525 | Even Integers - Consecutive Digits | c |
| 14526 | Packing Balls - Maximum Boxes | c |
| 14527 | Triangular Number - Factors Sum | c |
| 14528 | Validate Sentence | c |
| 14529 | Video Game Winner | c |
| 14530 | Triangle and Inverted Triangle Pattern | c |
| 14531 | function getTotalPoints | c |
| 14538 | Halindrome (Half Palindrome) | c |
| 15151 | Sum - Count of Subsequences | c |
| 15152 | Insert Characters - Make Even Length | c |
| 15153 | function getMinimumDeletions | c |
| 15156 | N Queries - Find Occurrences of X | c |
| 15157 | function getCommonDigit | c |
| 15158 | Add One Chocolate - N Boxes | c |
| 1871 | Welcome Message | c |
| 1872 | Repeat the input number | c |
| 1873 | Greet by Name | c |
| 1874 | Athlete & Medals Count | c |
| 1875 | Price Precision | c |
| 1876 | Hyphen Separated Co-Primes | c |
| 1877 | Railway Time Display | c |
| 1878 | Print Country Capital GDP | c |
| 1879 | Space Separated String Input | c |
| 1880 | Employee - Name Age Salary Asterisk | c |
| 2525 | Odd Integers In Range | c |
| 2527 | Second Largest Value among N integers | c |
| 2528 | String - Remove First & Last Characters | c |
| 2531 | HCF/GCD of Two Numbers | c |
| 2533 | String Reverse | c |
| 2534 | Sum of Tenth and Unit Digits | c |
| 2567 | Prime Number | c |
| 2568 | Fibonacci Sequence | c |
| 2569 | Print String Till Character | c |
| 2570 | Uppercase Letters Count | c |
| 2571 | Top Scoring Batsman Name | c |
| 2584 | Reverse String Till Underscore | c |
| 2593 | First Repeating Character | c |
| 2604 | Arrange Alphabets - Descending Order | c |
| 2611 | Odd Length String Diagonal Pattern [ZOHO] | c |
| 2613 | String - Reverse Words [ZOHO] | c |
| 2614 | Minimum Distance Between Words [AMAZON] | c |
| 2615 | Pattern Printing - Floyd Triangle | c |
| 2616 | Tower Line of Sight Issue | c |
| 2617 | String - Count Articles | c |
| 2618 | Array Product Except Index Value [AMAZON] | c |
| 2619 | Sub Palindromes | c |
| 2620 | Message Encryption | c |
| 2621 | Series Team Score | c |
| 5409 | C - Function - Print Square | c |
| 5410 | C - Function - Print Twice the Value | c |
| 5411 | C - Function - Sum of Two Numbers | c |
| 5412 | C - Function - Product of A and B | c |
| 5413 | C - Function - Minimum of N Integers | c |
| 5414 | C - Function - Array Elements Sum | c |
| 5415 | C - Function - Odd Factors Count | c |
| 6380 | C - Function - Reverse Second Half | c |
| 6381 | C - Function - Matrix Transpose | c |
| 6382 | C - Function - Digit Sum | c |
| 6572 | Assignment Distribution | c |
| 6576 | Area of a Ground | c |
| 6582 | Table Marked Price | c |
| 6587 | Circumference of the Circle | c |
| 6588 | Simple Interest Calculation | c |
| 6589 | Precision upto 3 decimal places | c |
| 6592 | Distributed and Remaining Idlis | c |
| 6593 | Interchanged Unit Digits | c |
| 6596 | Gift  Distribution | c |
| 6597 | Certificates Remaining | c |
| 6609 | Rainbow Colours | c |
| 6610 | Arithmetic Operation - Odd or Even | c |
| 6612 | Square or Rectangle or Quadrilateral | c |
| 6614 | WaterTemperature | c |
| 6615 | Type of Processor | c |
| 6627 | Day in a Week | c |
| 6633 | Print Digit - Unit and Tenth | c |
| 6638 | Vegetable Shop | c |
| 6650 | Largest Floating Point Value | c |
| 6652 | Predict Rain | c |
| 6679 | Function rowSum - CTS PATTERN | c |
| 6681 | Function root - CTS PATTERN | c |
| 6682 | Function consecutiveChar - CTS PATTERN | c |
| 6683 | getarraysum Logical Error CTS PATTERN | c |
| 6684 | Function findMinElement - CTS PATTERN | c |
| 6685 | Function printCharacterPattern - CTS PATTERN | c |
| 6686 | removeElement from Array - CTS PATTERN | c |
| 6687 | Function difference_in_dates - CTS PATTERN | c |
| 6688 | Function calculateMatrixSum - CTS PATTERN | c |
| 6689 | Function drawPrintpattern - CTS PATTERN | c |
| 6698 | Even or Odd Integers | c |
| 6700 | Square of N to N | c |
| 6703 | Count of Positive, Negative and Zeroes | c |
| 6705 | Cube of the Value from N to 1 | c |
| 6706 | Integers from N to 1 - Not Divisible by X | c |
| 6707 | Maximum Sum | c |
| 6710 | Print All Consonants | c |
| 6728 | Animal(s) or Bird(s) Sounds | c |
| 6735 | N Multiples of X | c |
| 6749 | Integer Pattern | c |
| 6779 | function isSameReflection | c |
| 6822 | Toggle Characters at X | c |
| 6831 | Sort Two String Values | c |
| 6832 | Longest String | c |
| 6835 | Adjacent Characters | c |
| 6857 | Remove First and Last Characters | c |
| 6859 | Longest Word | c |
| 6869 | Replace Spaces in S | c |
| 6880 | Odd or Even Length of S | c |
| 6883 | String Equality Ignoring Case | c |
| 6890 | Position of Characters - X | c |
| 6917 | Negative Integers in Reverse Order | c |
| 6926 | Even Integers in Descending Order | c |
| 6929 | Sum of N Integers Except Current Integer | c |
| 6930 | Same Position Elements in Two Arrays | c |
| 6937 | Odd Position and Even Position Elements | c |
| 6949 | Sum of Array Elements | c |
| 6964 | Formatted Arithmetic Operations | c |
| 6965 | 10 Percent Discount | c |
| 6966 | Cumulative Sum of Each Integer | c |
| 6967 | Print the Character | c |
| 6968 | String with Colon | c |
| 6969 | Sum of A and B | c |
| 6970 | ASCII Value of Character | c |
| 6971 | Three Integers - Sum and Division | c |
| 6972 | Sum of Two Digit Integers | c |
| 6973 | Sum of Three Floating Point Values | c |
| 6980 | Speed Conversion | c |
| 6982 | Sum of Least Significant Bits - M and N | c |
| 6983 | Profit on Selling Tables | c |
| 6986 | Perimeter of the Square | c |
| 6987 | Distance Covered | c |
| 6988 | Time Taken to Cover Distance | c |
| 6989 | Difference Between Two Time Periods | c |
| 6990 | Discounted Amount to be Paid | c |
| 6991 | Area of Regular Pentagon | c |
| 6992 | Simple Interest | c |
| 7009 | Equal Sum | c |
| 7017 | Absolute Difference between Two Integers | c |
| 7018 | Previous Alphabet | c |
| 7019 | Swap the Digits | c |
| 7020 | Divisibility of Integers | c |
| 7022 | Unit Digit or Tenth Digit | c |
| 7023 | Valid Character | c |
| 7024 | Tenth Digit Divisiblity | c |
| 7025 | Previous and Next Alphabets | c |
| 7026 | List of Discounts | c |
| 7027 | Article - Profit or Loss | c |
| 7029 | Profit or Loss - Bike | c |
| 7030 | Product or Sum of Three Integers | c |
| 7032 | Divisible or Not | c |
| 7034 | Four Integers - Adjacent | c |
| 7036 | Alphabetical Order or Not | c |
| 7039 | Alphabet in Range | c |
| 7043 | Younger Person | c |
| 7044 | Alphabetical Position | c |
| 7045 | Except Smallest Integer | c |
| 7076 | Alphabet Integer Pattern | c |
| 7077 | Middle Character(s) | c |
| 7081 | Integer with Hyphen Pattern | c |
| 7082 | X Lines Integers Pattern | c |
| 7083 | Alphabet Pattern Printing | c |
| 7084 | Number Increment Pattern | c |
| 7085 | Pattern Printing - Alternate 1 to N | c |
| 7087 | Count of Composite Numbers | c |
| 7088 | Palindromic Integers | c |
| 7089 | Time between Two | c |
| 7090 | Cumulative Sum of Prime Integers | c |
| 7109 | Unique Digit Sum Count | c |
| 7110 | Minimum Difference - N Integers | c |
| 7111 | Contiguous Integers or Not | c |
| 7112 | Multiply with the Minimum Adjacent | c |
| 7113 | Product of Two Halves Sum | c |
| 7114 | Same Frequency | c |
| 7116 | Weight of the String | c |
| 7117 | Alphabets Digits and Symbols | c |
| 7118 | Abbreviated String | c |
| 7119 | Camel Case String | c |
| 7120 | Space(s) after Punctuation Mark(s) | c |
| 7122 | String Modification | c |
| 7123 | Lexicographically in Descending Order | c |
| 7125 | Alphabet at Index | c |
| 7126 | Same Element - Two Arrays | c |
| 7138 | N Format In Matrix | c |
| 7139 | Matrix - Rows Odd/Even | c |
| 7145 | Replace the Common Elements - Matrix | c |
| 7146 | Same Element Matrix | c |
| 7147 | Matrix - Upper Left to Lower Right | c |
| 7148 | Zeros Matrix | c |
| 7149 | Column with Most Vowels | c |
| 7151 | Diagonally Dominant or Not | c |
| 7154 | Greater Alphabet between Two Matrices | c |
| 7156 | Diagonal Constant Matrix | c |
| 7691 | Sum of Right Side Element(s) | c |
| 8442 | Even followed by Odd integers | c |
| 8443 | Largest Unit Digits Integers | c |
| 8444 | Maximum Count Integer-Even or Odd | c |

---

## How to regenerate this tracker

- Just-scan mode:  `python3 tools/status.py`
- Full cross-check (needs an enumeration/statement json):
  `python3 tools/fetchlev.py <enum.json> --lev <N> --out /tmp/sack_stmts.json`
  then `python3 tools/status.py /tmp/sack_stmts.json --md document.md`
- The solved-problems table is regenerated from `solutions/` — all 390 files are
  committed under `solutions/<ProgramID>.md` (ProgramID is the join key).
- The `Pending` list is intentionally structural here — re-enumeration is required
  every bulk solve because SkillRack only shows unsolved problems and the list rotates.

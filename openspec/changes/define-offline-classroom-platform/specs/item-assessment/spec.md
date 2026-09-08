## Purpose

Item assessment gives the platform its quiz engine: native items that render and mark themselves offline, results recorded as learning records, and teacher authoring and override, for formative use only.

## ADDED Requirements

### Requirement: Native item model
The system SHALL support these item types: single choice, multiple choice, true or false, ordering, matching, text entry with accepted answers, numeric entry with tolerance, and extended text for teacher marking. Each item SHALL carry a prompt, its options or expected answers, response rules, feedback, and a score. Items SHALL be grouped into quizzes with an order.

#### Scenario: Quiz composed from a bank
- **WHEN** a teacher builds a ten-item quiz from imported and authored items
- **THEN** the quiz holds the items in the chosen order and can be added to a class or assigned as homework

### Requirement: Offline item player
The player SHALL render every item type, capture responses, and work with no connectivity, using keyboard and pointer alike.

#### Scenario: Quiz on the bus
- **WHEN** a learner completes a quiz on a loaned laptop with no connectivity
- **THEN** every item renders and every response is captured locally

### Requirement: Auto-marking on the device
Objective items SHALL be marked by the device when the learner submits. Each response SHALL be recorded in the learner log as an item-response operation and as an xAPI answered statement carrying the result, and quiz completion SHALL be recorded with a score and, where the quiz has a pass mark, a passed or failed result. Extended text items SHALL be queued for the teacher.

#### Scenario: Marked at home, seen at school
- **WHEN** a learner submits a quiz at home and the device meets the box the next morning
- **THEN** the teacher's overview shows the score and each response without the teacher marking anything

### Requirement: Teacher override
A teacher SHALL be able to override any auto-mark or mark any extended text response. An override SHALL be a mark operation that retains the original result as history.

#### Scenario: Ambiguous text answer
- **WHEN** a teacher accepts a text-entry answer the rules rejected
- **THEN** the learner's score updates, and the original auto-mark remains visible in the history

### Requirement: Attempts and feedback
A teacher SHALL set the attempts allowed per quiz, defaulting to unlimited, and when feedback is shown, defaulting to immediately after each item. All attempts SHALL be retained and the latest SHALL be current.

#### Scenario: Second attempt
- **WHEN** a learner retakes a quiz
- **THEN** both attempts are recorded, the latest is shown as current, and the teacher can see the first

### Requirement: Teacher authoring
Teachers SHALL author items and quizzes natively, site tier by default and declarable open with a licence, and SHALL be able to duplicate and edit imported items.

#### Scenario: Quick check for tomorrow
- **WHEN** a teacher writes five choice items on their laptop at home
- **THEN** the quiz is ready to add to the class when the laptop next meets the box

### Requirement: Formative boundary
The system SHALL impose no time limits, lockdown, or anti-cheating measures on quizzes. The system SHALL document that answer keys reach the device and can be extracted by a modified client, and SHALL present quiz results as formative evidence, never as summative assessment.

#### Scenario: Extracted answer key
- **WHEN** a learner extracts the answer key from their device's storage
- **THEN** nothing in the platform prevented it, and the teacher's guidance states that quizzes are practice, not examinations

### Requirement: Results views
The teacher's overview SHALL show results per learner per item and per item across the class, so that a teacher can see which questions the class found hard.

#### Scenario: Item the whole class missed
- **WHEN** most of the class answered one item incorrectly
- **THEN** the item view shows that item's success rate and the distribution of chosen options

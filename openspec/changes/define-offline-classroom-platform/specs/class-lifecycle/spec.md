## Purpose

The class is the unit a teacher works in: it is named, given a URL and a code, filled with content, started, and then runs with chat and homework whether or not the internet is up.

## ADDED Requirements

### Requirement: Create a class
A teacher SHALL create a class by naming it. Creation SHALL produce the class document, the class log, a short class URL, and a class code, and SHALL show the teacher the URL and code. A class SHALL NOT be visible to students until it is started.

#### Scenario: Teacher prepares a class the evening before
- **WHEN** a teacher creates "Year 8 Science" on their laptop
- **THEN** the class exists with a URL and a code, the teacher can add content to it, and no student device can see it yet

### Requirement: Start and stop
Starting a class SHALL make its URL live, its code valid, and its content visible to members. Stopping a class SHALL invalidate its code and pause its chat while leaving its content readable and learner work editable. A stopped class SHALL be startable again. Ending a class at the close of a year SHALL make it read-only for members and retain its data under the retention policy. Start, stop, and end SHALL be class-log operations signed by a teacher or administrator device.

#### Scenario: Press start
- **WHEN** the teacher presses start in the first lesson
- **THEN** students can join with the code and every content item already added is available to them

#### Scenario: Stop over the holidays
- **WHEN** a teacher stops the class for the break
- **THEN** no new device can join, members keep reading and working on what they have, and chat is paused until the class starts again

### Requirement: Add content at any time
A teacher SHALL be able to add to a live or stopped class, at any time: packs from the stock room, imported files, teacher documents, collaborations, and quizzes, and SHALL be able to arrange them into an ordered sequence of units. Added content SHALL reach each member's device at its next contact with the box. Removing content from a class SHALL NOT remove learner work that referenced it.

#### Scenario: Pack added mid-lesson
- **WHEN** a teacher adds a pack from the stock room during a lesson
- **THEN** every device in the room borrows it within the next sync and it appears in the unit the teacher placed it in

#### Scenario: Removed document keeps submissions
- **WHEN** a teacher removes a worksheet that three learners had already submitted work for
- **THEN** the three submissions remain in the learners' logs and the teacher's overview

### Requirement: The class URL
The class URL SHALL be short enough for a child to type and SHALL contain the class code. In box-as-network mode the landing page SHALL list live classes so that opening the browser is the whole instruction. Once the application is installed on a device, the class SHALL open with no connectivity.

#### Scenario: First lesson on lab PCs
- **WHEN** students open a browser on the box's network
- **THEN** they see the landing page listing the live classes and join the right one by tapping it and entering their name and PIN

### Requirement: Class chat
Each class SHALL have a chat visible to all members. Members SHALL post messages that are attributed by learner reference and displayed with names from the roster snapshot. Messages composed offline SHALL queue on the device and appear to others after the next contact with the box, in logical order with the author's time shown. Teachers SHALL be able to hide a message, which SHALL hide it for every member while retaining it in the log, and SHALL be able to pause and resume the chat.

#### Scenario: Message written on the bus
- **WHEN** a learner posts a question at home with no connectivity and the device meets the box the next morning
- **THEN** the message appears in the class chat with its original time, after messages already posted at school

#### Scenario: Teacher hides a message
- **WHEN** a teacher hides an inappropriate message
- **THEN** it disappears for every member at their next sync and remains in the log for the administrator

### Requirement: Homework to the class or to individuals
A teacher SHALL assign homework to the whole class or to selected learners. An assignment SHALL reference content (pack items, documents, imported files, or quizzes), MAY carry an advisory due date, and SHALL reach the targeted learners' devices at their next contact. A learner SHALL submit by marking a document's current state or completing a quiz, and the teacher SHALL see per learner whether the homework is not started, in progress, or submitted.

#### Scenario: Reading for everyone, extra practice for three
- **WHEN** a teacher assigns a chapter to the class and a quiz to three learners
- **THEN** every learner sees the chapter, only the three see the quiz, and the overview shows both assignments with their targets

#### Scenario: Submission after the due date
- **WHEN** a learner submits after the advisory due date
- **THEN** the submission is accepted and shown as late, with no automatic consequence

### Requirement: The teacher's overview
Each class SHALL have an overview for its teachers showing members, each member's devices with last contact and any overdue loan or loaned device, homework status per learner, quiz results, recent learning records, and chat activity. The overview SHALL work from the teacher device's own replicas with no connectivity.

#### Scenario: Next morning
- **WHEN** a teacher opens the overview before school with no connectivity
- **THEN** it shows which learners submitted last night's homework as of the device's last sync, and updates once the device meets the box

### Requirement: Teachers of a class
A class SHALL have one or more teachers. The creating teacher SHALL be able to add another teacher of the site to the class, and administrators SHALL be able to reassign a class to another teacher, for example when a teacher leaves.

#### Scenario: Teacher leaves mid-year
- **WHEN** an administrator reassigns a class to a new teacher
- **THEN** the new teacher's device receives the class documents, logs, roster snapshot, and learner record keys at its next sync

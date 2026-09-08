## Purpose

Learning records make the learner log an offline-native xAPI learning record store and give SCORM packages a local runtime, so activity is captured with no server round-trip and forwarded when peers meet.

## ADDED Requirements

### Requirement: xAPI statements as learner-log operations
The system SHALL record learning activity as xAPI statements stored as operations in the learner's log. The statement identifier SHALL be the operation identifier, statements SHALL be immutable, and a statement whose identifier already exists SHALL be ignored. The learner's device SHALL set the statement timestamp from its own clock, and the box SHALL set the stored time when it first folds the statement.

#### Scenario: Statement generated offline and forwarded
- **WHEN** a learner completes an activity at home and the device syncs at school the next day
- **THEN** the statement appears in the learner log once, with the home timestamp and the school-day stored time

#### Scenario: Duplicate statement identifier
- **WHEN** the same statement is emitted twice by a retried client operation
- **THEN** the learner log holds one statement

### Requirement: Pseudonymous actors
The actor of every statement SHALL be identified by an xAPI account whose home page is the site identifier and whose name is the learner reference. Statements SHALL NOT contain email, OpenID, or roster names. Teacher-authored statements about a learner SHALL name the learner the same way and SHALL be signed by the teacher device.

#### Scenario: Export contains no personal identifiers
- **WHEN** a teacher exports a learner's statements as xAPI JSON
- **THEN** every actor and every referenced agent is an account with the site home page and a learner reference

### Requirement: Voiding
The system SHALL support voiding through a statement with the voided verb referencing the target statement. The fold SHALL mark the target as voided while retaining it in the log, and queries SHALL exclude voided statements by default.

#### Scenario: Teacher voids an accidental statement
- **WHEN** a teacher voids a statement recorded against the wrong learner
- **THEN** the original remains in the log marked voided, is excluded from default queries, and the voiding statement is attributed to the teacher

### Requirement: Learning record queries
The box SHALL answer queries over folded statements by actor, verb, activity, registration, and time range, for teacher views and export, and SHALL export results as xAPI-conformant JSON.

#### Scenario: Progress view for a unit
- **WHEN** a teacher opens the progress view for a unit
- **THEN** the box returns each enrolled learner's statements for the unit's activities within the unit's dates

### Requirement: SCORM runtime API shim
The system SHALL expose the SCORM 1.2 and SCORM 2004 runtime API objects to launched content. Get and set calls SHALL operate on an in-memory data model for the attempt. On commit or terminate, and at a bounded interval while the content is open, the shim SHALL append a commit operation to the learner log containing the changed data model elements for the attempt. No call SHALL require a server round-trip.

#### Scenario: SCO runs entirely offline
- **WHEN** a learner launches a SCORM package with no connectivity and works for twenty minutes
- **THEN** every runtime call succeeds locally, commits are appended to the learner log, and they sync when the device next meets the box

### Requirement: SCORM attempts and concurrency
An attempt SHALL be identified by learner reference, activity, and attempt number, and SHALL be bound to the device that started it. Resuming an attempt on the device that owns it SHALL restore the last committed data model. A different device SHALL either start a new attempt or view the last committed state read-only. Concurrent commits for one attempt SHALL resolve to the owning device's highest sequence number.

#### Scenario: Resume on the same device
- **WHEN** a learner reopens a package on the same device after a suspend
- **THEN** the data model, including suspend data and bookmark, is restored from the last commit

### Requirement: SCORM to xAPI profile statements
On commit of completion status, success status, or score, the shim SHALL also emit xAPI statements following the ADL SCORM profile so that SCORM activity is visible in the same progress views and exports as native activity.

#### Scenario: Completion reported in both models
- **WHEN** a package commits completion status "completed"
- **THEN** the learner log gains a SCORM commit operation and an xAPI completed statement for the activity

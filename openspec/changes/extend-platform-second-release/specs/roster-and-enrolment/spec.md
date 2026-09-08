## ADDED Requirements

### Requirement: OneRoster-modelled import
The box SHALL import enrolment data in OneRoster CSV form (organisations, academic sessions, courses, classes, users, enrolments) and through a configurable column mapping for other management-system exports. Imports SHALL create or update directory entries and SHALL be repeatable, reconciling by source identifier rather than duplicating.

#### Scenario: Termly re-import
- **WHEN** an administrator imports the new term's export containing three new pupils and two leavers
- **THEN** the directory gains three learners, marks two as left, and proposes the corresponding enrolment operations

### Requirement: Reconciling imported and self-registered learners
An import SHALL propose matches between imported people and learners who registered themselves by class code, by name and class, for a teacher or administrator to confirm. Confirming SHALL attach the source identifier to the existing learner reference; learner references SHALL never be replaced, so history stays attached.

#### Scenario: Register meets the class list
- **WHEN** a school imports its management-system export after a term of self-registration
- **THEN** each imported pupil is matched to an existing learner where names and classes agree, the teacher confirms or corrects the matches, and no learner's history is lost

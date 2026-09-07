# Caliper 1.2 Projection Table

The fact log is the source; Caliper events are a projection. Each row gives
the fact (or stable derivation) that produces an event, the profile,
`type`, `action`, the `object`, and the extensions carried. Event `id` is a
v5 UUID over `(fact_id ‖ profile ‖ action)` in the tenant namespace;
`eventTime` is the fact's `device_hlc` physical time unless stated.

| Source | Profile | Event type | Action | Object | Generated / target | Extensions |
|---|---|---|---|---|---|---|
| Login (session issued) | Session | SessionEvent | LoggedIn | SoftwareApplication | Session | `trellis:region` |
| Session revoke / expiry | Session | SessionEvent | LoggedOut / TimedOut | SoftwareApplication | Session | |
| `lti.launch.v1` (tool role) | ToolLaunch | ToolLaunchEvent | Launched | SoftwareApplication (Trellis) | LtiSession | `trellis:deployment` |
| `lti.launch.v1` (platform role) | ToolUse | ToolUseEvent | Used | SoftwareApplication (tool) | — | |
| `progress.v1 {viewed}` | Reading | ViewEvent | Viewed | DigitalResource (page/file) | — | `trellis:syncTime` |
| `progress.v1 {navigated}` | Navigation | NavigationEvent | NavigatedTo | DigitalResource | referrer | |
| `attempt.start.v1` | Assessment | AssessmentEvent | Started | Assessment | Attempt | `trellis:attemptN`, `trellis:keyVersion` |
| `resp.v1` | AssessmentItem | AssessmentItemEvent | Completed | AssessmentItem | Response (typed by interaction) | `trellis:factId`, `trellis:keyVersion`, `trellis:clientMark` (advisory) |
| `attempt.submit.v1` (quiz) | Assessment | AssessmentEvent | Submitted | Assessment | Attempt | `trellis:late`, `trellis:claimedOnTime`, `trellis:elapsedMs` |
| `attempt.submit.v1` (assignment) | Assignable | AssignableEvent | Submitted | AssignableDigitalResource | Attempt | as above |
| `attempt.start.v1` (assignment) | Assignable | AssignableEvent | Started | AssignableDigitalResource | Attempt | |
| Stable derived outcome change | Grading | GradeEvent | Graded | Attempt | Score | `trellis:vector`, `trellis:engineVersion`, `trellis:keyVersion`, `trellis:rubricVersion`, `trellis:voidedBy` (when the change follows a void) |
| `mark.v1` | Grading | GradeEvent | Graded (actor = marker) | Attempt | Score | `trellis:rubricVersion` |
| `feedback.v1` | Feedback | FeedbackEvent | Commented | Attempt | Comment | |
| `rating.v1` | Feedback | FeedbackEvent | Ranked | Message | Rating | |
| `post.v1` (new thread) | Forum | ThreadEvent | Posted | Thread | Message | `trellis:offlineSynced` |
| `post.v1` (reply) | Forum | MessageEvent | Posted | Message | replyTo | as above |
| `post.edit.v1` | Forum | MessageEvent | Modified | Message | | |
| `subscribe.v1` | Forum | ForumEvent | Subscribed / Unsubscribed | Forum | | |
| `choice.v1` / feedback activity response | Survey | SurveyEvent / QuestionnaireItemEvent | Completed | Questionnaire / QuestionnaireItem | Response | |
| `award.v1` → `issue.v1` | (none in 1.2) | not projected | — | — | — | credentials are exposed by OB3, not Caliper |

Not projected: `void.v1` (no retraction in Caliper), `noop.v1`,
`sys.abandon.v1`, structure and authoring facts (Resource Management
profile deferred), identity/profile/consent facts, interop facts, ledger
entries.

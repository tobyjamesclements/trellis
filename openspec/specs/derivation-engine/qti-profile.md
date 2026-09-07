# QTI 3.0 Engine Profile

The derivation engine implements the following subset of QTI 3.0 for
client-side and server-side marking. Anything outside it is classified
`marking = server_or_human` at publish (CAC-08).

## Interactions (Delivery, Core level)

choiceInteraction, orderInteraction, associateInteraction, matchInteraction,
gapMatchInteraction, inlineChoiceInteraction, textEntryInteraction,
extendedTextInteraction (human or pattern-marked), hottextInteraction,
hotspotInteraction, selectPointInteraction, graphicOrderInteraction,
graphicAssociateInteraction, graphicGapMatchInteraction, sliderInteraction,
uploadInteraction (human-marked), endAttemptInteraction.

Out of initial scope: drawingInteraction, mediaInteraction (delivery only,
no marking), customInteraction / PCI (roadmap), adaptive items
(`adaptive="true"`).

## Response processing

Standard templates: `match_correct`, `map_response`, `map_response_point`.

Custom operators (deterministic subset): `responseCondition`,
`responseIf/ElseIf/Else`, `setOutcomeValue`, `exitResponse`, `lookupOutcomeValue`,
`match`, `equal`, `equalRounded`, `lt`, `lte`, `gt`, `gte`, `and`, `or`, `not`,
`isNull`, `member`, `contains`, `subtract`, `sum`, `product`, `divide`,
`integerDivide`, `integerModulus`, `round`, `roundTo`, `truncate`, `power`,
`max`, `min`, `mapResponse`, `mapResponsePoint`, `index`, `ordered`,
`multiple`, `containerSize`, `fieldValue`, `delete`, `variable`, `correct`,
`default`, `baseValue`, `null`, `stringMatch`, `patternMatch`, `substring`,
`customOperator` **(rejected)**, `random`, `randomInteger`, `randomFloat`
(seeded per DRV-03), `anyN`, `numberCorrect`, `numberIncorrect`,
`numberResponded`, `numberPresented`, `numberSelected`, `outcomeMinimum`,
`outcomeMaximum`, `testVariables`, `durationLT`/`durationGTE` (use `sync_hlc`
deltas; advisory).

`mathOperator`, `mathConstant`, `statsOperator`, `repeat`, `gcd`, `lcm`
are supported. `customOperator` is not, because it is not deterministic by
definition.

## Template processing

Supported (`templateCondition`, `setTemplateValue`, `setCorrectResponse`,
`setDefaultValue`, seeded random operators).

## Test model

`assessmentTest` with parts, sections, `selection`/`ordering` (seeded),
`preCondition`, `branchRule`, `itemSessionControl` (attempt limits are
advisory on the client; the server counts), `timeLimits` (advisory),
`outcomeProcessing` with the operator subset above.

## Extended text pattern marking

`patternMatch` and `stringMatch` allow deterministic marking of short text.
Free-text essays are human-marked (`mark.v1`). No model-based marking is in
scope.

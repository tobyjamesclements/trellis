## Purpose

Localisation makes the platform usable in the languages of its first markets, English and Spanish, with the interface language chosen per device and the content language carried by each pack and document.

## ADDED Requirements

### Requirement: Interface languages at launch
The client, the box interface, the installer, the status page, and the console shown on an attached display SHALL be fully available in English and Spanish at launch. Every user-facing string SHALL be externalised, a further language SHALL be addable by supplying a translation file without a platform code change, and any untranslated string SHALL fall back to English and be listed for translators.

#### Scenario: Spanish installation
- **WHEN** an administrator installs the box in Spanish
- **THEN** the installer, status page, console, and administration interface are in Spanish throughout

#### Scenario: Missing translation
- **WHEN** a new platform version ships a string with no Spanish translation
- **THEN** the string appears in English and is listed in the translation report

### Requirement: Language per device
The interface language SHALL be chosen on each device at first run and changeable at any time, so teachers and students at one box may use different languages. The box status page and installer SHALL use the administrator's language. Codes and QR forms SHALL be language-neutral.

#### Scenario: Mixed classroom
- **WHEN** a teacher uses the interface in English and a student uses it in Spanish on the same box
- **THEN** each sees their own language and the class content is the same for both

### Requirement: Content language is independent of interface language
Packs SHALL carry a language tag in their manifest, and documents and imported files SHALL carry a language field defaulting from the device that created them. The stock room, catalogue, and class views SHALL show the content language and allow filtering by it.

#### Scenario: English pack, Spanish interface
- **WHEN** a Spanish-interface class uses an English pack
- **THEN** the pack shows its language in the class content and renders in English inside a Spanish interface

### Requirement: Locale formatting
Dates, times, numbers, and the sorting of names SHALL follow the interface language, and the time zone SHALL come from the device. No wall-clock dependence SHALL be introduced by localisation.

#### Scenario: Decimal separators
- **WHEN** a numeric-entry item is answered on a Spanish-interface device
- **THEN** the answer is accepted with a comma as the decimal separator and marked by value

### Requirement: Multilingual catalogue text
Pack catalogue metadata MAY carry several languages, and the interface SHALL show the device's language when present and the pack's own language otherwise.

#### Scenario: Bilingual pack description
- **WHEN** a pack carries English and Spanish descriptions
- **THEN** a Spanish-interface device shows the Spanish description and an English-interface device the English one

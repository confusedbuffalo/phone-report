## [5.13.3](https://github.com/confusedbuffalo/phone-report/compare/v5.13.2...v5.13.3) (2026-06-13)


### Bug Fixes

* fix quote typo ([0427bf1](https://github.com/confusedbuffalo/phone-report/commit/0427bf1ff6ff93c1281735fc67b35dd3a2afbc38))

## [5.13.2](https://github.com/confusedbuffalo/phone-report/compare/v5.13.1...v5.13.2) (2026-06-13)


### Bug Fixes

* fix manual review link in bot changesets ([d24b3a9](https://github.com/confusedbuffalo/phone-report/commit/d24b3a97f4f6be6ffd9aa67dfa4d83414126b509))

## [5.13.1](https://github.com/confusedbuffalo/phone-report/compare/v5.13.0...v5.13.1) (2026-06-11)


### Bug Fixes

* fix imports in refactored phone processing ([dc1137f](https://github.com/confusedbuffalo/phone-report/commit/dc1137fb3e1775f532b23fbf7d34adb3e4133839))

# [5.13.0](https://github.com/confusedbuffalo/phone-report/compare/v5.12.0...v5.13.0) (2026-06-11)


### Features

* add warning for service times without a day specified and stop ambiguous hours being fixable ([4c1b443](https://github.com/confusedbuffalo/phone-report/commit/4c1b443a3cb602cdb5fc994be43cae96d9ad43b8))

# [5.12.0](https://github.com/confusedbuffalo/phone-report/compare/v5.11.0...v5.12.0) (2026-06-10)


### Features

* enable bot in PT and TR ([252ac9c](https://github.com/confusedbuffalo/phone-report/commit/252ac9cdc12ef3648bd2b7abbedd92ddef84953d))

# [5.11.0](https://github.com/confusedbuffalo/phone-report/compare/v5.10.0...v5.11.0) (2026-06-09)


### Bug Fixes

* offer better fix for NANP numbers if formatted in a standard way even when technically valid in another country ([dc76a31](https://github.com/confusedbuffalo/phone-report/commit/dc76a316d9ac8471837fb0ba7bed7fdc14726171)), closes [#295](https://github.com/confusedbuffalo/phone-report/issues/295)


### Features

* add BG ([e05d517](https://github.com/confusedbuffalo/phone-report/commit/e05d517499920e608cfd79d4b8be1b95e2ff4728)), closes [#399](https://github.com/confusedbuffalo/phone-report/issues/399)

# [5.10.0](https://github.com/confusedbuffalo/phone-report/compare/v5.9.0...v5.10.0) (2026-06-06)


### Bug Fixes

* skip admin boundaries for names ([24ea151](https://github.com/confusedbuffalo/phone-report/commit/24ea151bccda4920027469094909cf6ec3ef9eb1))


### Features

* add retry for temporary downloading errors ([c6e23b9](https://github.com/confusedbuffalo/phone-report/commit/c6e23b9191d21031bdc77e23a9ce9011bbd37db0))

# [5.9.0](https://github.com/confusedbuffalo/phone-report/compare/v5.8.0...v5.9.0) (2026-06-03)


### Features

* retry bot edits on 5xx errors up to 3 times ([df866f4](https://github.com/confusedbuffalo/phone-report/commit/df866f45fe1c0ab995b5dfd0ace1d10f66645d15))
* TR 444 numbers should be national format and allow BR to have hyphen before final 4 digits ([f54dac0](https://github.com/confusedbuffalo/phone-report/commit/f54dac02beef9108747f8c8597b41c706353ee8b))

# [5.8.0](https://github.com/confusedbuffalo/phone-report/compare/v5.7.3...v5.8.0) (2026-06-01)


### Features

* allow AR numbers to have a final hyphen and fix more toll free formatting issues ([08f763c](https://github.com/confusedbuffalo/phone-report/commit/08f763cd61ecc842e4cc1d365a7f1ffaf7cf81d0))
* flatten some FR divisions ([9a10ed4](https://github.com/confusedbuffalo/phone-report/commit/9a10ed41e1ab46359d581462eacc95c6dcf871a3))

## [5.7.3](https://github.com/confusedbuffalo/phone-report/compare/v5.7.2...v5.7.3) (2026-05-31)


### Bug Fixes

* shared cost numbers in DE are reachable internationally so need a country code ([85031a3](https://github.com/confusedbuffalo/phone-report/commit/85031a3db7dc7820aa48afb4178daaced4f5761c))
* some phone numbers with extensions were incorrectly shown as invalid ([1174e07](https://github.com/confusedbuffalo/phone-report/commit/1174e07499f712080366cfb2182629d667ebd2cb))

## [5.7.2](https://github.com/confusedbuffalo/phone-report/compare/v5.7.1...v5.7.2) (2026-05-30)


### Bug Fixes

* ensure that foreign toll free numbers are in international format ([17374b4](https://github.com/confusedbuffalo/phone-report/commit/17374b42894576a55a27f218f78207796b193a68))
* make edit buttons go grey when middle clicked ([fcb2e17](https://github.com/confusedbuffalo/phone-report/commit/fcb2e178afca0b86019220539d934e4235af16c8))
* suggest fix for foreign whatsapp numbers in urls ([e2d0817](https://github.com/confusedbuffalo/phone-report/commit/e2d081724c1aa6b67d4a4a36c2ac5d2c5ecd61a7))
* Use official languages by region in names report ([827d9b7](https://github.com/confusedbuffalo/phone-report/commit/827d9b778d4576722d8d9608a54ee5a33ea95f96)), closes [#380](https://github.com/confusedbuffalo/phone-report/issues/380)

## [5.7.1](https://github.com/confusedbuffalo/phone-report/compare/v5.7.0...v5.7.1) (2026-05-29)


### Bug Fixes

* Reconsider toll free formatting. ([0b15be8](https://github.com/confusedbuffalo/phone-report/commit/0b15be86f9ddbc9749d2e52a135ade5ffa8d2a6b))

# [5.7.0](https://github.com/confusedbuffalo/phone-report/compare/v5.6.0...v5.7.0) (2026-05-29)


### Bug Fixes

* Add prolonged sound mark as another incorrect hyphen type ([f3e5973](https://github.com/confusedbuffalo/phone-report/commit/f3e5973f603ad51f8f88bbee913028dcee206908))
* add PY to incorrect leading plus fix ([021435b](https://github.com/confusedbuffalo/phone-report/commit/021435be1d21789dfacde09fd19d26b98f303583))
* Autofix toll free numbers changing from international to national format ([2b09746](https://github.com/confusedbuffalo/phone-report/commit/2b097464c439d988b3b5d08f2e3c3297a7ba2bc0))
* Remove evaluation tool text from description now that there are individual links ([d62bdf0](https://github.com/confusedbuffalo/phone-report/commit/d62bdf011324605c4a1a397833434551c64a32ec))
* Toll free numbers with extensions were treated as invalid in NANP ([b26e224](https://github.com/confusedbuffalo/phone-report/commit/b26e224b34e337cbb49c70301415994e556e538f))


### Features

* BR: Use states instead of regions for divisions ([b39e032](https://github.com/confusedbuffalo/phone-report/commit/b39e0323c03c7de318010f98c049b77a836c28df))
* enable safe fix bot in SE ([9de8476](https://github.com/confusedbuffalo/phone-report/commit/9de847639ead7936546abee7402698eb1a63b38f))
* support undelimited multilingual names in some regions ([#375](https://github.com/confusedbuffalo/phone-report/issues/375)) ([5e44c96](https://github.com/confusedbuffalo/phone-report/commit/5e44c96e9f87e64ac4a3b338b12d5d8cf284a36c))

# [5.6.0](https://github.com/confusedbuffalo/phone-report/compare/v5.5.0...v5.6.0) (2026-05-28)


### Bug Fixes

* All toll free and other similar non-standard cost numbers should be in national format worldwide except NANP ([c01dbcf](https://github.com/confusedbuffalo/phone-report/commit/c01dbcf77a507650e81d140496fdfa48e34df837))
* More limited warning for ambiguous single-digit hours ([8faedc9](https://github.com/confusedbuffalo/phone-report/commit/8faedc979a33aee69c905e74f0ab6bfc3fe9f20b))


### Features

* Add link to hours evaluation tool for each item ([f75223c](https://github.com/confusedbuffalo/phone-report/commit/f75223c2c1bc2a008818a84be5129104683c4729))

# [5.5.0](https://github.com/confusedbuffalo/phone-report/compare/v5.4.0...v5.5.0) (2026-05-27)


### Bug Fixes

* No spaces around opening hours fallback separator is valid ([d584a25](https://github.com/confusedbuffalo/phone-report/commit/d584a250c02bef87dad9d9d496ef96800373ef01))
* Show problem labels for hours with no suggested fix ([f356d7a](https://github.com/confusedbuffalo/phone-report/commit/f356d7a05a8ce59f4f2c403cfcce4a4455bdce0d))


### Features

* Add initial basic warning for ambiguous single-digit hours ([eafeb51](https://github.com/confusedbuffalo/phone-report/commit/eafeb5196d420bb766fc119cd070a51d8a0173c4))

# [5.4.0](https://github.com/confusedbuffalo/phone-report/compare/v5.3.1...v5.4.0) (2026-05-26)


### Bug Fixes

* Avoid missing key in footer on initial load ([bc22a52](https://github.com/confusedbuffalo/phone-report/commit/bc22a52421ba786410690b02a481e828282d0051))
* Disconnected hours rules are not autofixable ([95939e4](https://github.com/confusedbuffalo/phone-report/commit/95939e4ce04ed66b4d720cf99cbb0c165a7cad74))
* Escape labels for mobile showing literal html ([b213f25](https://github.com/confusedbuffalo/phone-report/commit/b213f25f970229eb75c2e3d349003dd4ae093e04))
* Fix via comment in notes ([2ce2727](https://github.com/confusedbuffalo/phone-report/commit/2ce2727ed82d1ed2bff9c61d472047992e4c0dd1))


### Features

* Add login button to upload modal ([c755014](https://github.com/confusedbuffalo/phone-report/commit/c755014b5e01a5a33e6bdbf3e4fc8ebeaaffb8a0))
* Flatten IE regions ([9de3dd3](https://github.com/confusedbuffalo/phone-report/commit/9de3dd32ada50fce243918c9753c0b5cbe39e743))

## [5.3.1](https://github.com/confusedbuffalo/phone-report/compare/v5.3.0...v5.3.1) (2026-05-25)


### Bug Fixes

* Add message for no invalid opening hours ([30a79cf](https://github.com/confusedbuffalo/phone-report/commit/30a79cfb3580c52d94ee6df75640ac69ce7d130c))
* Consider any spacing between month and days with colon valid ([19911e2](https://github.com/confusedbuffalo/phone-report/commit/19911e21ff8a4fe0482a8f33c659a16423997da9))
* Don't mark disconnected ranges as fixable if there is no fix ([9489689](https://github.com/confusedbuffalo/phone-report/commit/94896899396924c176996ccc7971fc30c6f6d86d))
* Fix warning showing up for all invalid opening hours values ([e2764e5](https://github.com/confusedbuffalo/phone-report/commit/e2764e521d1c88232da622955594ee867e147ab5))
* Use pointer cursor on modal buttons ([36136e3](https://github.com/confusedbuffalo/phone-report/commit/36136e3fc6e70a96c17d6c7e0b4d37bbeec182d8))

# [5.3.0](https://github.com/confusedbuffalo/phone-report/compare/v5.2.0...v5.3.0) (2026-05-24)


### Bug Fixes

* Detect and fix "w." as marking an extension (PL) ([9ba375d](https://github.com/confusedbuffalo/phone-report/commit/9ba375dea34808c6f3024e1f29a2ee255782015c))
* Ensure that invisible characters are detected and filtered out when processing phone numbers ([5a9e967](https://github.com/confusedbuffalo/phone-report/commit/5a9e96741b3e2af8223cf1fcc33f563316f4f822))
* Ensure URLs consistently use encoded components ([dad2eaf](https://github.com/confusedbuffalo/phone-report/commit/dad2eaf57af8755309d762e13be3dfcca8fbcf64))
* Fix English names in French history ([30410c8](https://github.com/confusedbuffalo/phone-report/commit/30410c8d9dbecb7f5213331865d99e42f805e00d))
* Give country sort buttons initial style to avoid flash ([e9cc65b](https://github.com/confusedbuffalo/phone-report/commit/e9cc65b5da5eed64a3eadef1515991054e047c11))


### Features

* Add South American countries ([00785ab](https://github.com/confusedbuffalo/phone-report/commit/00785abd345694b38d3331e6fff898d4b873ab7e))
* Add warning label for disconnected times used in one rule for opening hours ([48cdc0c](https://github.com/confusedbuffalo/phone-report/commit/48cdc0c498de6f275985a8a00a94a75d3fe8f533))

# [5.2.0](https://github.com/confusedbuffalo/phone-report/compare/v5.1.3...v5.2.0) (2026-05-23)


### Bug Fixes

* Fix overflowing title on some progress pages ([5494273](https://github.com/confusedbuffalo/phone-report/commit/549427316c2bb564fa774caba23da27de6bc8c89))


### Features

* Add custom legend on progress pages fixes [#349](https://github.com/confusedbuffalo/phone-report/issues/349) ([0cd6e72](https://github.com/confusedbuffalo/phone-report/commit/0cd6e7223dc5bd04d5136a6e392d9de19d846696))

## [5.1.3](https://github.com/confusedbuffalo/phone-report/compare/v5.1.2...v5.1.3) (2026-05-21)


### Bug Fixes

* Don't put problem labels for invalid number consisting of multiple numbers ([c20e772](https://github.com/confusedbuffalo/phone-report/commit/c20e7724082257ea05dae5234730a34bad7ef3ae))
* Ensure raw metadata is escaped or encoded before being injected into links ([e9bfd02](https://github.com/confusedbuffalo/phone-report/commit/e9bfd021007e38be0a3805db65a0c2569ebb6d1d))
* Fallback to default translations and remove bad hours history ([#348](https://github.com/confusedbuffalo/phone-report/issues/348)) ([fe3203e](https://github.com/confusedbuffalo/phone-report/commit/fe3203e9f1d0791cd46672e81d7321a3ed22fb5c))
* Fix country page stats display ([7187631](https://github.com/confusedbuffalo/phone-report/commit/7187631328a351c0c91f37c6f0a4983a460fbd7f))
* Fix extra spacing on report page ([09a0948](https://github.com/confusedbuffalo/phone-report/commit/09a0948ac5ef26b68f5bd06b26af4b8764023218))
* Fix overflowing tag values ([0e8f243](https://github.com/confusedbuffalo/phone-report/commit/0e8f243e1109db01a19342037db5b956ce0ea262))


### Performance Improvements

* Remove duplicate preset parsing ([cac14f3](https://github.com/confusedbuffalo/phone-report/commit/cac14f3b15ee89cc812af4f501674f67b110bda3))

## [5.1.2](https://github.com/confusedbuffalo/phone-report/compare/v5.1.1...v5.1.2) (2026-05-20)


### Bug Fixes

* allow off and closed to be title case in opening hours ([9b11371](https://github.com/confusedbuffalo/phone-report/commit/9b11371c58df54704d90eeed52b0f3685733ac3b))
* Double escaping in sort label ([2fbf78c](https://github.com/confusedbuffalo/phone-report/commit/2fbf78ca61fa428d22a04684259ce85c80eaf623))
* Fix length issue labels not displaying ([efcb36c](https://github.com/confusedbuffalo/phone-report/commit/efcb36c758fdb1682e4d1d67607a1b8d2e9d0ce6))
* Fix login issues ([3fd0950](https://github.com/confusedbuffalo/phone-report/commit/3fd09505705dd43f82418ba4fbf1aa67b7b06b2f))
* Flag fewer issues with spacing and capitalisation in opening hours ([cd99ee9](https://github.com/confusedbuffalo/phone-report/commit/cd99ee91b17d7552a6e5abe35b60ae802fe247b1))
* show full error when bot edit fails ([0dea34c](https://github.com/confusedbuffalo/phone-report/commit/0dea34cfa53f898ccb65e012dbf0bdf53d961c24))
* Use more natural wrapping for tag values ([d2a7b8b](https://github.com/confusedbuffalo/phone-report/commit/d2a7b8b71ea96a6017a02f78c7449bb512f8c04d))


### Performance Improvements

* Add LRU cache for phone validation ([6c6c4b7](https://github.com/confusedbuffalo/phone-report/commit/6c6c4b7280c8d52b94d86e6ac0f728340069dd70))
* Optimise primary name checking ([31539ab](https://github.com/confusedbuffalo/phone-report/commit/31539abb4322f4337343403801ab5ae435ec5dd4))
* Refactor website tag lookup and optimise area calculation for points ([6aa26a3](https://github.com/confusedbuffalo/phone-report/commit/6aa26a3b2e70971b3eb69bac31ed15a04a296df8))

## [5.1.1](https://github.com/confusedbuffalo/phone-report/compare/v5.1.0...v5.1.1) (2026-05-19)


### Bug Fixes

* locale for hours processing ([8d8ae76](https://github.com/confusedbuffalo/phone-report/commit/8d8ae76122f000a210315909e5ac86d921b54546))

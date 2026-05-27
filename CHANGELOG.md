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

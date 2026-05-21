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

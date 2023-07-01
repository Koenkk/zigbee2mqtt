# Changelog

## [1.32.0](https://github.com/Koenkk/zigbee2mqtt/compare/1.31.2...1.32.0) (2023-07-01)


### Features

* Support Home Assistant water device_class ([#18066](https://github.com/Koenkk/zigbee2mqtt/issues/18066)) ([e083a6b](https://github.com/Koenkk/zigbee2mqtt/commit/e083a6bff7fafd17d5ff6ad4b87916b83727d8be))
* Support settable Home Assistant text ([#18114](https://github.com/Koenkk/zigbee2mqtt/issues/18114)) ([9474452](https://github.com/Koenkk/zigbee2mqtt/commit/94744525ba466c6512ab6a6181b3073970a02023))


### Bug Fixes

* Fix Home Assistant truncate error when `program` is `null`. https://github.com/Koenkk/zigbee2mqtt/issues/16460 ([11f0be5](https://github.com/Koenkk/zigbee2mqtt/commit/11f0be55d871363cb4c07adbbeac57fb4ddf479e))
* **ignore:** Better fix for [#17891](https://github.com/Koenkk/zigbee2mqtt/issues/17891) ([#17951](https://github.com/Koenkk/zigbee2mqtt/issues/17951)) ([a7e02a7](https://github.com/Koenkk/zigbee2mqtt/commit/a7e02a7be847418df463095b68951c1a1459ca83))
* **ignore:** Fix DeviceMessage.meta type ([8833947](https://github.com/Koenkk/zigbee2mqtt/commit/88339473ce7eb09add8f1836ab4c33b4a405d7e7))
* **ignore:** Fix e10dd893ab2875e5420952b4452bf75aeec93922 ([446dbbf](https://github.com/Koenkk/zigbee2mqtt/commit/446dbbf1fc0e07c61cd233c8b4ea509ce6423c86))
* **ignore:** update dependencies ([#17991](https://github.com/Koenkk/zigbee2mqtt/issues/17991)) ([e10dd89](https://github.com/Koenkk/zigbee2mqtt/commit/e10dd893ab2875e5420952b4452bf75aeec93922))
* **ignore:** update dependencies ([#18052](https://github.com/Koenkk/zigbee2mqtt/issues/18052)) ([1dc0b24](https://github.com/Koenkk/zigbee2mqtt/commit/1dc0b24e9a8ae9a03809aff5d3ff9758b63d9f22))
* **ignore:** update dependencies ([#18112](https://github.com/Koenkk/zigbee2mqtt/issues/18112)) ([57566c7](https://github.com/Koenkk/zigbee2mqtt/commit/57566c76ed8ccaabcdc32f84a7fddcf5da3b02b3))
* **ignore:** update zigbee-herdsman to 0.15.0 ([#17966](https://github.com/Koenkk/zigbee2mqtt/issues/17966)) ([05cab61](https://github.com/Koenkk/zigbee2mqtt/commit/05cab61e1faa15a9a72d87f8e9ec26e3d1eb4046))
* **ignore:** update zigbee-herdsman to 0.15.1 ([#18080](https://github.com/Koenkk/zigbee2mqtt/issues/18080)) ([17cff2a](https://github.com/Koenkk/zigbee2mqtt/commit/17cff2a26f16207bd30bb2659e11ce792d02dd75))
* **ignore:** update zigbee-herdsman to 0.15.2 ([#18091](https://github.com/Koenkk/zigbee2mqtt/issues/18091)) ([03005b3](https://github.com/Koenkk/zigbee2mqtt/commit/03005b38c86f79384e20bb240a8947ce969411c6))
* **ignore:** update zigbee-herdsman to 0.15.3 ([#18116](https://github.com/Koenkk/zigbee2mqtt/issues/18116)) ([2d62027](https://github.com/Koenkk/zigbee2mqtt/commit/2d62027e24ea2de401155e0bc7fabaee85fa7bab))
* **ignore:** update zigbee-herdsman to 0.16.0 ([#18124](https://github.com/Koenkk/zigbee2mqtt/issues/18124)) ([38c2ea5](https://github.com/Koenkk/zigbee2mqtt/commit/38c2ea5bf72f67f29b89dc84524e91923989fd27))
* **ignore:** update zigbee-herdsman-converters to 15.20.0 ([#17954](https://github.com/Koenkk/zigbee2mqtt/issues/17954)) ([0c7e7e5](https://github.com/Koenkk/zigbee2mqtt/commit/0c7e7e5089d1023150f23123df7eab90ea65fe59))
* **ignore:** update zigbee-herdsman-converters to 15.22.0 ([#18004](https://github.com/Koenkk/zigbee2mqtt/issues/18004)) ([b0b3aee](https://github.com/Koenkk/zigbee2mqtt/commit/b0b3aee6483efe9fbb2f434c44ed76d6b3a4e54a))
* **ignore:** update zigbee-herdsman-converters to 15.23.0 ([#18015](https://github.com/Koenkk/zigbee2mqtt/issues/18015)) ([4ad838c](https://github.com/Koenkk/zigbee2mqtt/commit/4ad838c114edc7dd5d9d104df9b2ce49933a8c20))
* **ignore:** update zigbee-herdsman-converters to 15.24.0 ([#18025](https://github.com/Koenkk/zigbee2mqtt/issues/18025)) ([c47f5df](https://github.com/Koenkk/zigbee2mqtt/commit/c47f5df021478e8997f13f06ea17591b745615e3))
* **ignore:** update zigbee-herdsman-converters to 15.25.0 ([#18056](https://github.com/Koenkk/zigbee2mqtt/issues/18056)) ([57aaa5a](https://github.com/Koenkk/zigbee2mqtt/commit/57aaa5a85aff308d4bd66353fd42969eb38a60d4))
* **ignore:** update zigbee-herdsman-converters to 15.26.0 ([#18067](https://github.com/Koenkk/zigbee2mqtt/issues/18067)) ([91d67a0](https://github.com/Koenkk/zigbee2mqtt/commit/91d67a0ef5135e08ac81171b78931b7903efcc5a))
* **ignore:** update zigbee-herdsman-converters to 15.27.0 ([#18075](https://github.com/Koenkk/zigbee2mqtt/issues/18075)) ([5777d76](https://github.com/Koenkk/zigbee2mqtt/commit/5777d76e5508d7dba4750aa5efc34977ba01de1a))
* **ignore:** update zigbee-herdsman-converters to 15.28.0 ([#18092](https://github.com/Koenkk/zigbee2mqtt/issues/18092)) ([6d3389b](https://github.com/Koenkk/zigbee2mqtt/commit/6d3389b409b003740ac4b2b90aa39a8ccbec26e3))
* **ignore:** update zigbee-herdsman-converters to 15.29.0 ([#18099](https://github.com/Koenkk/zigbee2mqtt/issues/18099)) ([a744838](https://github.com/Koenkk/zigbee2mqtt/commit/a744838e9c982461479f0b5273e25abd32c4074d))
* **ignore:** update zigbee-herdsman-converters to 15.30.0 ([#18115](https://github.com/Koenkk/zigbee2mqtt/issues/18115)) ([a56719d](https://github.com/Koenkk/zigbee2mqtt/commit/a56719d19ca32fabf375e293cdef0172826c8672))
* **ignore:** update zigbee-herdsman-converters to 15.31.0 ([#18125](https://github.com/Koenkk/zigbee2mqtt/issues/18125)) ([ed85367](https://github.com/Koenkk/zigbee2mqtt/commit/ed85367e5383b9a59a69fe2836b02763f6744849))
* **ignore:** update zigbee-herdsman-converters to 15.32.0 ([#18132](https://github.com/Koenkk/zigbee2mqtt/issues/18132)) ([61dd1dd](https://github.com/Koenkk/zigbee2mqtt/commit/61dd1dd96dc9154f2b46a635bf2ccaeac2d69ba5))
* **ignore:** update zigbee-herdsman-converters to 15.33.0 ([#18156](https://github.com/Koenkk/zigbee2mqtt/issues/18156)) ([81973c3](https://github.com/Koenkk/zigbee2mqtt/commit/81973c3a2a356c52859d167d3eedaf78f747b8e5))
* **ignore:** update zigbee-herdsman-converters to 15.33.1 ([#18161](https://github.com/Koenkk/zigbee2mqtt/issues/18161)) ([d1824f1](https://github.com/Koenkk/zigbee2mqtt/commit/d1824f169b71e0590dce14d7f451dbbb67bdf5d9))

## [1.31.0](https://github.com/Koenkk/zigbee2mqtt/compare/1.30.4...v1.31.0) (2023-06-01)


### Features

* **ignore:** update CI/CD ([b3de973](https://github.com/Koenkk/zigbee2mqtt/commit/b3de973af66e7c308987adeaab4d89759d4bfef0))
* **ignore:** update CI/CD ([0d17d26](https://github.com/Koenkk/zigbee2mqtt/commit/0d17d2613357db225f224bdbf191fbd9ad17b4a5))
* **ignore:** update zigbee-herdsman-converters to 15.6.0 ([#17774](https://github.com/Koenkk/zigbee2mqtt/issues/17774)) ([24baed3](https://github.com/Koenkk/zigbee2mqtt/commit/24baed3053d91276369d0cad02e96afee97329f8))
* **ignore:** update zigbee-herdsman-converters to 15.7.0 ([#17777](https://github.com/Koenkk/zigbee2mqtt/issues/17777)) ([1344ae0](https://github.com/Koenkk/zigbee2mqtt/commit/1344ae06163f5b6a3c68e532f39b379158040c6f))


### Bug Fixes

* Fix Home Assistant `Payload is not supported (e.g. open, closed, opening, closing, stopped): STOP` error. https://github.com/Koenkk/zigbee2mqtt/issues/17552 ([e6f9aed](https://github.com/Koenkk/zigbee2mqtt/commit/e6f9aeda06ec96c76c3d455bb016a10073d0bf54))
* **ignore:** Fix build ([#17838](https://github.com/Koenkk/zigbee2mqtt/issues/17838)) ([d119f60](https://github.com/Koenkk/zigbee2mqtt/commit/d119f609de683313335fbb37e2ce358a16fdc597))
* **ignore:** update dependencies ([#17811](https://github.com/Koenkk/zigbee2mqtt/issues/17811)) ([a71857c](https://github.com/Koenkk/zigbee2mqtt/commit/a71857c7236c66da577352160de96eacc683c7c3))
* **ignore:** update zigbee-herdsman to 0.14.117 ([#17770](https://github.com/Koenkk/zigbee2mqtt/issues/17770)) ([8457c37](https://github.com/Koenkk/zigbee2mqtt/commit/8457c3735b2f2c9c5106ce76fc7d2988f9eb1ea1))
* **ignore:** update zigbee-herdsman-converters to 15.10.0 ([#17797](https://github.com/Koenkk/zigbee2mqtt/issues/17797)) ([b7b3b51](https://github.com/Koenkk/zigbee2mqtt/commit/b7b3b51cfeb9b672f2cca128733b273f50966e19))
* **ignore:** update zigbee-herdsman-converters to 15.11.0 ([#17808](https://github.com/Koenkk/zigbee2mqtt/issues/17808)) ([2e8dfbb](https://github.com/Koenkk/zigbee2mqtt/commit/2e8dfbb96ecbebece84cc1aab12899162e27f82e))
* **ignore:** update zigbee-herdsman-converters to 15.12.0 ([#17837](https://github.com/Koenkk/zigbee2mqtt/issues/17837)) ([be82b73](https://github.com/Koenkk/zigbee2mqtt/commit/be82b737be5f7a7e58d653628ce66e0813fad111))
* **ignore:** update zigbee-herdsman-converters to 15.13.0 ([#17842](https://github.com/Koenkk/zigbee2mqtt/issues/17842)) ([b228d9d](https://github.com/Koenkk/zigbee2mqtt/commit/b228d9daf64c8d315803120814dc31272ee1c459))
* **ignore:** update zigbee-herdsman-converters to 15.13.1 ([#17851](https://github.com/Koenkk/zigbee2mqtt/issues/17851)) ([4b20dfa](https://github.com/Koenkk/zigbee2mqtt/commit/4b20dfafab6193f328aa9133d2b063284abf6cbf))
* **ignore:** update zigbee-herdsman-converters to 15.8.2 ([#17789](https://github.com/Koenkk/zigbee2mqtt/issues/17789)) ([8b579b6](https://github.com/Koenkk/zigbee2mqtt/commit/8b579b6533876f3b7440dc74b2b709cbfc7ccaf3))
* **ignore:** update zigbee-herdsman-converters to 15.9.0 ([#17791](https://github.com/Koenkk/zigbee2mqtt/issues/17791)) ([5b807c3](https://github.com/Koenkk/zigbee2mqtt/commit/5b807c36eced55e790a8393667e07680736f37be))

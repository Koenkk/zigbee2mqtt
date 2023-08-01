# Changelog

## [1.32.2](https://github.com/Koenkk/zigbee2mqtt/compare/1.32.1...1.32.2) (2023-08-01)


### Bug Fixes

* Fix `'dict object' has no attribute 'ir_code_to_send'` error. https://github.com/Koenkk/zigbee2mqtt/issues/18180 ([dec9191](https://github.com/Koenkk/zigbee2mqtt/commit/dec91919bc50aed1f1d3fd9525abd2db49242e7f))
* Fix insecure Zigbee network encryption key generation ([#18372](https://github.com/Koenkk/zigbee2mqtt/issues/18372)) ([df8e168](https://github.com/Koenkk/zigbee2mqtt/commit/df8e1687b2db3f49ba8c3d97a4c92b7892a54f1e))
* Fix not all cluster unbound/bound when specified. https://github.com/Koenkk/zigbee2mqtt/issues/10740 ([0bdf663](https://github.com/Koenkk/zigbee2mqtt/commit/0bdf663ca126d0569b62871e1b787992472faea4))
* Fix socket error crashing Zigbee2MQTT ([#18388](https://github.com/Koenkk/zigbee2mqtt/issues/18388)) ([f64cd7e](https://github.com/Koenkk/zigbee2mqtt/commit/f64cd7e8f38f0c1fc1bbd85b5b5caf560565c024))
* **ignore:** Add ep `l` till 24 ([#18422](https://github.com/Koenkk/zigbee2mqtt/issues/18422)) ([4bd281c](https://github.com/Koenkk/zigbee2mqtt/commit/4bd281ce6cbd43f38b2a3131cd38b25885a22b3a))
* **ignore:** Add th1-th10 endpoints for Ubisys H10 ([#18405](https://github.com/Koenkk/zigbee2mqtt/issues/18405)) ([91f22f1](https://github.com/Koenkk/zigbee2mqtt/commit/91f22f1230241f5fb3b27b2ee84d944a1c3c5107))
* **ignore:** Attempt 2 to fix cache saving ([ea412cf](https://github.com/Koenkk/zigbee2mqtt/commit/ea412cfe82a0462930ec8dddf00b9a363c484b73))
* **ignore:** Attempt 3 to fix commit-user-lookup ([590564c](https://github.com/Koenkk/zigbee2mqtt/commit/590564c15888f73826f20eca91e2c253c7d000e7))
* **ignore:** Attempt to fix cache not saving ([fa02bb5](https://github.com/Koenkk/zigbee2mqtt/commit/fa02bb5b74216db78b23db144c915d00c7dc48c1))
* **ignore:** fix commit-user-lookup cache ([758b814](https://github.com/Koenkk/zigbee2mqtt/commit/758b8144a19ca04eac5faae5b7e16c090e9fda77))
* **ignore:** Fix failing test ([ba0cc61](https://github.com/Koenkk/zigbee2mqtt/commit/ba0cc6196550b3b6873f3733690daef9002c5863))
* **ignore:** update dependencies ([#18260](https://github.com/Koenkk/zigbee2mqtt/issues/18260)) ([ee1a5f0](https://github.com/Koenkk/zigbee2mqtt/commit/ee1a5f04008beaac54fb68e20c31c1664563a4f2))
* **ignore:** update dependencies ([#18403](https://github.com/Koenkk/zigbee2mqtt/issues/18403)) ([8e94662](https://github.com/Koenkk/zigbee2mqtt/commit/8e946623a9db6282a53b55d5d5f3e4b000d080ee))
* **ignore:** update zigbee-herdsman to 0.17.2 ([#18291](https://github.com/Koenkk/zigbee2mqtt/issues/18291)) ([073989c](https://github.com/Koenkk/zigbee2mqtt/commit/073989c7a434c3fd73abaee95fa4ada9394d695d))
* **ignore:** update zigbee-herdsman-converters to 15.38.0 ([#18262](https://github.com/Koenkk/zigbee2mqtt/issues/18262)) ([813dd49](https://github.com/Koenkk/zigbee2mqtt/commit/813dd49a41e7d3f41b6c79db708bb08d29cd7f0c))
* **ignore:** update zigbee-herdsman-converters to 15.39.0 ([#18282](https://github.com/Koenkk/zigbee2mqtt/issues/18282)) ([3c855d2](https://github.com/Koenkk/zigbee2mqtt/commit/3c855d20424761d43ace9b5ed55460eedce092f0))
* **ignore:** update zigbee-herdsman-converters to 15.39.1 ([#18292](https://github.com/Koenkk/zigbee2mqtt/issues/18292)) ([a3c8e1c](https://github.com/Koenkk/zigbee2mqtt/commit/a3c8e1c3c98bd97ef52c29929dc9bb5f9598d0fd))
* **ignore:** update zigbee-herdsman-converters to 15.40.0 ([#18314](https://github.com/Koenkk/zigbee2mqtt/issues/18314)) ([af0521b](https://github.com/Koenkk/zigbee2mqtt/commit/af0521b54ca9195e62d68ccd9fcb49d0d0c226e4))
* **ignore:** update zigbee-herdsman-converters to 15.41.0 ([#18328](https://github.com/Koenkk/zigbee2mqtt/issues/18328)) ([330a913](https://github.com/Koenkk/zigbee2mqtt/commit/330a913e76b556295f57290743670a40e48139ca))
* **ignore:** update zigbee-herdsman-converters to 15.42.0 ([#18343](https://github.com/Koenkk/zigbee2mqtt/issues/18343)) ([313865b](https://github.com/Koenkk/zigbee2mqtt/commit/313865b0a38754df52ef2f28132053a47379cc43))
* **ignore:** update zigbee-herdsman-converters to 15.43.0 ([#18356](https://github.com/Koenkk/zigbee2mqtt/issues/18356)) ([7a22cee](https://github.com/Koenkk/zigbee2mqtt/commit/7a22cee639bf9115c6782302900b89f4978468d9))
* **ignore:** update zigbee-herdsman-converters to 15.44.0 ([#18365](https://github.com/Koenkk/zigbee2mqtt/issues/18365)) ([3408e3c](https://github.com/Koenkk/zigbee2mqtt/commit/3408e3c05a102d32818260c0368a47c9726aa40d))
* **ignore:** update zigbee-herdsman-converters to 15.45.0 ([#18404](https://github.com/Koenkk/zigbee2mqtt/issues/18404)) ([57d031d](https://github.com/Koenkk/zigbee2mqtt/commit/57d031d54aadaf87513d2c7d32f3302db501be67))
* **ignore:** update zigbee-herdsman-converters to 15.46.0 ([#18421](https://github.com/Koenkk/zigbee2mqtt/issues/18421)) ([ced3d43](https://github.com/Koenkk/zigbee2mqtt/commit/ced3d43dad5f8a578f1875ffaf68ffb1d177c584))
* **ignore:** update zigbee-herdsman-converters to 15.47.0 ([#18430](https://github.com/Koenkk/zigbee2mqtt/issues/18430)) ([087b85c](https://github.com/Koenkk/zigbee2mqtt/commit/087b85cb9f3bc7a317dc22483461de32a9c1a0d8))
* **ignore:** update zigbee-herdsman-converters to 15.48.0 ([#18438](https://github.com/Koenkk/zigbee2mqtt/issues/18438)) ([d487f37](https://github.com/Koenkk/zigbee2mqtt/commit/d487f37a7a755e37caf3a8da4f8190981fdb5625))
* **ignore:** update zigbee-herdsman-converters to 15.49.0 ([#18443](https://github.com/Koenkk/zigbee2mqtt/issues/18443)) ([8139d7f](https://github.com/Koenkk/zigbee2mqtt/commit/8139d7f1f494b4051c1bba7ea453e76e4be77fad))
* **ignore:** update zigbee-herdsman-converters to 15.50.0 ([#18475](https://github.com/Koenkk/zigbee2mqtt/issues/18475)) ([3478e40](https://github.com/Koenkk/zigbee2mqtt/commit/3478e4001760541b65d9bfdbdcd1d082a3da8023))
* **ignore:** update zigbee-herdsman-converters to 15.50.1 ([#18487](https://github.com/Koenkk/zigbee2mqtt/issues/18487)) ([683d29f](https://github.com/Koenkk/zigbee2mqtt/commit/683d29f9f70f3149cbbff6b543d53af0f931e706))
* **ignore:** update zigbee2mqtt-frontend to 0.6.132 ([#18289](https://github.com/Koenkk/zigbee2mqtt/issues/18289)) ([05eff95](https://github.com/Koenkk/zigbee2mqtt/commit/05eff957eb3c5414df7bf2909b5b6d9ff6fdb258))
* **ignore:** update zigbee2mqtt-frontend to 0.6.133 ([#18390](https://github.com/Koenkk/zigbee2mqtt/issues/18390)) ([e1d52ae](https://github.com/Koenkk/zigbee2mqtt/commit/e1d52ae43aa132f296d151eced7d208cfb1b3a62))
* Use HA sensor device class `atmospheric_pressure` instead of `pressure` ([#18306](https://github.com/Koenkk/zigbee2mqtt/issues/18306)) ([1252f10](https://github.com/Koenkk/zigbee2mqtt/commit/1252f10d39beed640370410a45d5c2fdc504b440))

## [1.32.1](https://github.com/Koenkk/zigbee2mqtt/compare/1.32.0...1.32.1) (2023-07-08)

### Bug Fixes

* **ignore:** update zigbee-herdsman-converters to 15.33.1-hotfix.0 ([15601d6](https://github.com/Koenkk/zigbee2mqtt/commit/15601d6339cfc7408872a71071a98abadd9b33ff))

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

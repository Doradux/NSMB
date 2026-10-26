"""W15-A: invented metadata and call graphs only; no Nintendo source or addresses."""
import json
import unittest

from provenance_model import check_synthetic_provenance

ROOT = 0x80004000
WALK = 0x80004100
SEED = 0x80004200
FROM_SEED = 0x80004300
SKIPPED = 0x80004400
ORPHAN = 0x80004500


def metadata(addresses, unsupported=0, invalid_ssa=0):
    return json.dumps({
        "functions": [{"entryPoint": address} for address in addresses],
        "quality": {
            "unsupportedInstructionCount": unsupported,
            "invalidSsaFunctionCount": invalid_ssa,
        },
    })


def check(*, emitted=(ROOT, WALK), seeds=(SKIPPED,),
          edges=((ROOT, WALK),), skipped=(SKIPPED,), quality=None, root=ROOT):
    return check_synthetic_provenance(
        root=root, map_seeds=seeds, discovery_edges=edges,
        skipped_map_seeds=skipped,
        metadata_json=metadata(emitted) if quality is None else quality,
    )


class SyntheticProvenanceModel(unittest.TestCase):
    def test_recursive_translation_not_in_map_can_be_modeled(self):
        actual = check()
        self.assertEqual(actual.root_reachable, (ROOT, WALK))
        self.assertEqual(actual.speculative_reachable, ())
        self.assertEqual(actual.skipped_map_seeds, (SKIPPED,))
        self.assertTrue(actual.quality_clean)
        self.assertFalse(actual.producer_attested)
        self.assertFalse(actual.authentic_release_eligible)

    def test_speculative_success_and_recursive_descendant(self):
        actual = check(emitted=(ROOT, WALK, SEED, FROM_SEED), seeds=(SEED, SKIPPED),
                       edges=((ROOT, WALK), (SEED, FROM_SEED)), skipped=(SKIPPED,))
        self.assertEqual(actual.root_reachable, (ROOT, WALK))
        self.assertEqual(actual.speculative_reachable, (SEED, FROM_SEED))
        self.assertEqual(actual.emitted, (ROOT, WALK, SEED, FROM_SEED))
        self.assertFalse(actual.authentic_release_eligible)

    def test_root_may_also_be_map_seed_without_doubling(self):
        actual = check(seeds=(ROOT, SKIPPED))
        self.assertEqual(actual.root_reachable, (ROOT, WALK))
        self.assertEqual(actual.speculative_reachable, ())

    def test_root_only_empty_map_is_modelable_not_authenticated(self):
        actual = check(emitted=(ROOT,), seeds=(), edges=(), skipped=())
        self.assertEqual(actual.root_reachable, (ROOT,))
        self.assertFalse(actual.authentic_release_eligible)

    def test_recursive_abi_graph_cycle_terminates_but_not_proof(self):
        actual = check(edges=((ROOT, WALK), (WALK, ROOT)))
        self.assertEqual(actual.root_reachable, (ROOT, WALK))
        self.assertFalse(actual.producer_attested)

    def test_unexplained_emitted_function_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "orphan"):
            check(emitted=(ROOT, WALK, ORPHAN))

    def test_orphan_call_cycle_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "orphan"):
            check(emitted=(ROOT, WALK, SEED, ORPHAN), seeds=(),
                  edges=((ROOT, WALK), (SEED, ORPHAN), (ORPHAN, SEED)), skipped=())

    def test_missing_map_seed_outcome_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "missing both"):
            check(skipped=())

    def test_skipped_map_seed_cannot_be_emitted(self):
        with self.assertRaisesRegex(ValueError, "skipped MAP"):
            check(emitted=(ROOT, WALK, SKIPPED))

    def test_non_map_skipped_address_cannot_be_forged(self):
        with self.assertRaisesRegex(ValueError, "skip must belong"):
            check(skipped=(SKIPPED, ORPHAN))

    def test_discovery_edge_requires_emitted_parent_and_child(self):
        for edges in (((ORPHAN, WALK),), ((ROOT, ORPHAN),)):
            with self.subTest(edges=edges), self.assertRaisesRegex(ValueError, "endpoint"):
                check(edges=edges)

    def test_missing_root_emission_is_structural_failure(self):
        with self.assertRaisesRegex(ValueError, "root has no"):
            check(emitted=(WALK,), edges=())

    def test_invalid_uint32_bool_and_text_are_rejected_not_coerced(self):
        for root in (True, -1, 0x100000000, "0x80004000", 3.4):
            with self.subTest(root=root), self.assertRaisesRegex(ValueError, "uint32"):
                check(root=root)

    def test_duplicate_map_and_skips_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate MAP"):
            check(seeds=(SKIPPED, SKIPPED))
        with self.assertRaisesRegex(ValueError, "duplicate skipped"):
            check(skipped=(SKIPPED, SKIPPED))

    def test_invalid_edge_schema_rejected(self):
        for edges in (((ROOT,),), ((ROOT, WALK, SEED),), ("not an edge",), (5,)):
            with self.subTest(edges=edges), self.assertRaises(ValueError):
                check(edges=edges)

    def test_duplicate_translation_metadata_rejected_by_real_parser(self):
        with self.assertRaisesRegex(ValueError, "Repeated translation"):
            check(quality=metadata((ROOT, WALK, ROOT)))

    def test_string_metadata_uint32_rejected_by_real_parser(self):
        with self.assertRaisesRegex(ValueError, "integer uint32"):
            check(quality=metadata((ROOT, "0x80004100")))

    def test_bad_quality_schema_rejected(self):
        with self.assertRaisesRegex(ValueError, "nonnegative integer"):
            check(quality=metadata((ROOT, WALK), unsupported=False))

    def test_nonzero_quality_never_claims_release(self):
        actual = check(quality=metadata((ROOT, WALK), unsupported=2))
        self.assertFalse(actual.quality_clean)
        self.assertFalse(actual.authentic_release_eligible)

    def test_perfectly_consistent_self_claims_still_not_attested(self):
        actual = check(emitted=(ROOT, WALK, SEED), seeds=(SEED,),
                       edges=((ROOT, WALK),), skipped=())
        self.assertTrue(actual.quality_clean)
        self.assertFalse(actual.producer_attested)
        self.assertFalse(actual.authentic_release_eligible)


if __name__ == "__main__":
    unittest.main()

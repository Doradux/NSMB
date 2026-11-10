"""Independent invented PPC-Lite ABI behavior, not genuine Nintendo PPC."""
import random,unittest
from scripts.phase20.luigi.abi import LeafInput,Status,evaluate,graph,source_inputs


class InventedOracle(unittest.TestCase):
    def test_nested_calls_and_exact_step_count(self):
        self.assertEqual(evaluate(LeafInput(gpr3=100)).gpr3,118)
        self.assertEqual(evaluate(LeafInput(entry_offset=0x40,gpr3=100)).gpr3,104)
        self.assertEqual(evaluate(LeafInput()).steps,8)
        self.assertEqual(evaluate(LeafInput(entry_offset=0x40)).steps,5)

    def test_addi_sign_extension_and_wrap(self):
        self.assertEqual(evaluate(LeafInput(entry_offset=0x60)).gpr3,0xFFFFFFFD)
        self.assertEqual(evaluate(LeafInput(entry_offset=0xE0,gpr3=0xFFFFFFFF)).gpr3,10)
        self.assertEqual(evaluate(LeafInput(entry_offset=0x40,gpr3=0xFFFFFFFF)).gpr3,3)

    def test_external_lr_preserved_while_shadow_calls_return(self):
        for lr in (0,0x80010004,0xFFFFFFFF):
            r=evaluate(LeafInput(lr=lr,stack_sentinel=0xDEADBEEF))
            self.assertTrue(r.computed)
            self.assertEqual((r.lr,r.return_pc),(lr,0x80010004))

    def test_wrong_pc_denial_zero_result(self):
        for pc in (0,0x80010004,0xFFFFFFFF):
            r=evaluate(LeafInput(expected_pc=pc,gpr3=23,lr=0xCAFE))
            self.assertEqual(r.status,Status.wrongPc)
            self.assertEqual((r.gpr3,r.lr,r.return_pc),(0,0,0))

    def test_bad_or_unlisted_entry_has_no_partial_result(self):
        for entry in (0xA0,0xC0,0x300,0x80010000):
            r=evaluate(LeafInput(entry_offset=entry,gpr3=12))
            self.assertNotEqual(r.status,Status.ok)
            self.assertEqual((r.gpr3,r.lr,r.return_pc),(0,0,0))

    def test_max_step_budget_terminates_before_commit(self):
        for limit in (0,1,2,3,5,7,129):
            r=evaluate(LeafInput(max_steps=limit,gpr3=100))
            self.assertEqual(r.status,Status.stepLimit)
            self.assertEqual((r.gpr3,r.lr,r.return_pc),(0,0,0))
        self.assertEqual(evaluate(LeafInput(max_steps=8)).status,Status.ok)

    def test_graph_causal_targets_are_byte_derived(self):
        g=graph()
        self.assertEqual(g[0],(0x20,0xE0))
        self.assertEqual(g[0x40],(0x60,))
        self.assertEqual(g[0xA0],(0xC0,))

    def test_random_500_source_oracle_cases(self):
        rng=random.Random(20201110)
        for _ in range(500):
            entry=rng.choice((0,0x20,0x40,0x60,0xE0,0xA0,0x300))
            initial=rng.randrange(2**32)
            r=evaluate(LeafInput(entry_offset=entry,gpr3=initial))
            if r.computed:
                delta={0:18,0x20:2,0x40:4,0x60:-3,0xE0:11}[entry]
                self.assertEqual(r.gpr3,(initial+delta)&0xFFFFFFFF)
            else:
                self.assertEqual((r.gpr3,r.lr,r.return_pc),(0,0,0))


if __name__=='__main__':unittest.main()

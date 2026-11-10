"""RED->GREEN: phase19 child transport bounds stdout AND stderr before EOF."""
from __future__ import annotations
import sys
import time
import unittest

from scripts.phase19.luigi.pipeline import child


class ProducerTransportLimits(unittest.TestCase):
    def test_hostile_stdout_flood_denied_without_unbounded_capture(self):
        start=time.monotonic()
        with self.assertRaisesRegex(ValueError,'bounded subprocess'):
            child([sys.executable,'-B','-c',
                   'import sys;sys.stdout.buffer.write(b"x"*600001);sys.stdout.flush()'],
                  timeout=5)
        self.assertLess(time.monotonic()-start,5)

    def test_hostile_stderr_flood_denied_without_pipe_deadlock(self):
        start=time.monotonic()
        with self.assertRaisesRegex(ValueError,'bounded subprocess'):
            child([sys.executable,'-B','-c',
                   'import sys;sys.stderr.buffer.write(b"x"*600001);sys.stderr.flush()'],
                  timeout=5)
        self.assertLess(time.monotonic()-start,5)

    def test_stalled_child_killed_and_reaped(self):
        start=time.monotonic()
        with self.assertRaisesRegex(ValueError,'deadline'):
            child([sys.executable,'-B','-c','import time;time.sleep(10)'],timeout=.25)
        self.assertLess(time.monotonic()-start,3)

    def test_stdout_and_stderr_both_bounded_success(self):
        p=child([sys.executable,'-B','-c',
                  'import sys;print("A");print("B",file=sys.stderr)'],timeout=3)
        self.assertEqual((p.returncode,p.stdout,p.stderr),(0,b"A\n",b"B\n"))

    def test_nonstop_or_error_exit_rejected(self):
        with self.assertRaisesRegex(ValueError,'returned a failure'):
            child([sys.executable,'-B','-c','raise SystemExit(4)'],timeout=3)
        self.assertEqual(child([sys.executable,'-B','-c',
                                'raise SystemExit(3)'],timeout=3).returncode,3)


if __name__=='__main__':unittest.main()

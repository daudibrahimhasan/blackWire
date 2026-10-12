import unittest
from unittest.mock import patch

from blackwire_launcher import MINIMUM_NODE, _node_version


class LauncherTests(unittest.TestCase):
    def test_minimum_node_is_22_5(self):
        self.assertEqual(MINIMUM_NODE, (22, 5, 0))

    @patch("blackwire_launcher.subprocess.run")
    def test_parses_node_version(self, run):
        run.return_value.stdout = "v24.1.2\n"
        self.assertEqual(_node_version("node"), (24, 1, 2))


if __name__ == "__main__":
    unittest.main()

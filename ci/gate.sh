#!/usr/bin/env bash
#
# The gate, as the anywaye CI runs it.
#
# The CI runs THIS file. It is here so that "what CI runs" is one named
# thing in the repository: the check behind gate.yml's ci block reads this
# file and asks whether it invokes the declared gate, and it can only answer
# that if there is a file to read.
#
# The command below is the argv gate.yml declares under ci.invokes, spelled
# the same way, so the declaration and the gate cannot drift apart without
# the check noticing.
set -euo pipefail
cd "$(dirname "$0")/.."

exec bin/prime --contracts

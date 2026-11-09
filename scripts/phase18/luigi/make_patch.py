"""Generate source-site C# trace patch for PINNED PUBLIC translator (no upstream edits)."""
from pathlib import Path
from difflib import unified_diff
import argparse
import re

PROGRAM="translator/src/Translator.Cli/Program.cs"
SINK="translator/src/Translator.Cli/PublicProducerTrace.cs"
PIN="20f0158dd1d96bd94f821adf80ee361e4fbd414e"

def once(body,needle,repl,label):
    count=body.count(needle)
    if count!=1:raise ValueError(f"{label} anchor count {count} (expected 1)")
    return body.replace(needle,repl)

def instrument(body):
    ops=[
    ("        Directory.CreateDirectory(outDir);\n\n        var visited",
     """        Directory.CreateDirectory(outDir);
        // Source-site observation is OPTIONAL and self-reported, NOT attested.
        using var causalTrace = PublicProducerTrace.OpenFromEnvironment();
        if (causalTrace is not null && (outputMetadataPath is null || !emitFunctionFiles))
            throw new InvalidOperationException("Trace requires --output-metadata and function files.");
        if (causalTrace is not null)
        {
            causalTrace.Emit("source_sha256", startAddr, sha256:
                PublicProducerTrace.HashFile(RequireProject().Inputs.Dol.Path));
            if (functionMap is not null)
                causalTrace.Emit("map_sha256", startAddr, sha256:
                    PublicProducerTrace.HashFile(functionMap.SourcePath));
            if (!string.IsNullOrWhiteSpace(projectOption))
                causalTrace.Emit("project_config_sha256", startAddr, sha256:
                    PublicProducerTrace.HashFile(projectOption));
        }
        var visited""","init"),
    ("        visited.Add(startAddr);\n\n        // Map entries",
     """        visited.Add(startAddr);
        causalTrace?.Emit("root_declared", startAddr);

        // Map entries""","root"),
    ("        var speculativeSkips = new List<(uint Address, string Reason)>();",
     """        var speculativeSkips = new List<(uint Address, string Reason)>();
        if (causalTrace is not null)
            foreach (var seed in speculativeSeeds)
                causalTrace.Emit("map_seed_declared", seed);""","seeds"),
    ("""                var candidates = QueueBatch.Dequeue(
                    speculativeSeeds,
                    batchSize,
                    address => translated.Contains(address) || !visited.Add(address));""",
     """                var candidates = QueueBatch.Dequeue(
                    speculativeSeeds,
                    batchSize,
                    address => {
                        var rejected = translated.Contains(address) || !visited.Add(address);
                        if (rejected) causalTrace?.Emit("map_seed_deduplicated", address);
                        return rejected;
                    });""","seed_dedup"),
    ("""                foreach (var address in candidates)
                {
                    // Nothing calls this from the translated set""",
     """                foreach (var address in candidates)
                {
                    causalTrace?.Emit("map_seed_queued", address);
                    // Nothing calls this from the translated set""","seed_queue"),
    ("""            var results = new FunctionDiscoveryResult?[batch.Count];
            IndexedParallel.For(batch.Count, parallelOptions, i => results[i] = Attempt(batch[i], speculative));""",
     """            // Serial, deterministic dispatch intent (not worker completion order).
            if (causalTrace is not null)
                foreach (var item in batch)
                    causalTrace.Emit(speculative ? "speculative_attempted" : "walk_attempted", item.Address);
            var results = new FunctionDiscoveryResult?[batch.Count];
            IndexedParallel.For(batch.Count, parallelOptions, i => results[i] = Attempt(batch[i], speculative));""","attempt"),
    ("""                if (results[i] is not { } result) continue;
                CommitResult(batch[i], result, discoveryTargets[i], summaries[i]);""",
     """                if (results[i] is not { } result)
                {
                    if (speculative) causalTrace?.Emit("speculative_skipped", batch[i].Address);
                    continue;
                }
                CommitResult(batch[i], result, discoveryTargets[i], summaries[i]);""","skip"),
    ("""            translated.Add(work.Address);
            translatedFunctionEnds[work.Address] = GetFunctionInstructionEnd(result);""",
     """            translated.Add(work.Address);
            causalTrace?.Emit("translation_committed", work.Address);
            translatedFunctionEnds[work.Address] = GetFunctionInstructionEnd(result);""","commit"),
    ("""                    queue.Enqueue((target, work.Depth + 1));
                }
            }

            // Discovery needs decoded PPC instructions""",
     """                    queue.Enqueue((target, work.Depth + 1));
                    causalTrace?.Emit("target_discovered", target, parent: work.Address);
                }
            }

            // Discovery needs decoded PPC instructions""","discovery"),
    ("""            bundleWriter?.Complete();
            LogPhase("emission wave + bundle write");""",
     """            bundleWriter?.Complete();
            causalTrace?.Emit("bundle_wave_completed", startAddr);
            LogPhase("emission wave + bundle write");""","wave"),
    ]
    for needle,repl,label in ops:body=once(body,needle,repl,label)
    body=once(body,
      """                IndexedParallel.For(affected.Count, parallelOptions, k =>
                {""",
      """                // Retry intent observed in serial order BEFORE workers race.
                if (causalTrace is not null)
                    foreach (var index in affected)
                        causalTrace.Emit("boundary_retry_attempted", batch[index].Address);
                IndexedParallel.For(affected.Count, parallelOptions, k =>
                {""","retry")
    body=once(body,
      """                    translatedFlowCoverage[address] = CoalesceInstructionRanges(repaired[i]);
                }
            }

            LogPhase("boundary repair");""",
      """                    translatedFlowCoverage[address] = CoalesceInstructionRanges(repaired[i]);
                    causalTrace?.Emit("boundary_superseded", address);
                }
            }

            LogPhase("boundary repair");""","repair")
    return body

def finish(body):
    body=once(body,
    """            Console.WriteLine(updated
                ? $"[translator] Updated base translation metadata: {outputMetadataPath}"
                : $"[translator] Base translation metadata unchanged: {outputMetadataPath}");
        }
        if (completedModAwareness is not null)""",
    """            Console.WriteLine(updated
                ? $"[translator] Updated base translation metadata: {outputMetadataPath}"
                : $"[translator] Base translation metadata unchanged: {outputMetadataPath}");
            // Verify actual durable emitted bytes, after the final writer and metadata.
            if (causalTrace is not null)
                foreach (var function in completedOutputMetadata.Functions)
                {
                    var path = Path.Combine(outDir, function.RelativePath);
                    var actualHash = PublicProducerTrace.HashFile(path);
                    if (!string.Equals(actualHash, function.Sha256,
                        StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("Observed function byte SHA mismatch.");
                    causalTrace.Emit("output_emitted", function.EntryPoint,
                        sha256: actualHash);
                }
        }
        if (completedModAwareness is not null)""","output bytes")
    body=once(body,
    """        Console.WriteLine($"[translator] File writes: {filesUpdated} updated, {filesUnchanged} unchanged.");
    }
    catch (Exception ex)""",
    """        Console.WriteLine($"[translator] File writes: {filesUpdated} updated, {filesUnchanged} unchanged.");
        // Completion requires actual durable output metadata & function bytes.
        // An empty or partial translation NEVER gets run_completed.
        if (causalTrace is not null)
        {
            if (completedOutputMetadata is null ||
                completedOutputMetadata.Functions.Count != translated.Count)
                throw new InvalidDataException("Incomplete causal function inventory.");
            causalTrace.Emit("metadata_sha256", startAddr, sha256:
                PublicProducerTrace.HashFile(outputMetadataPath!));
            causalTrace.Emit("run_completed", startAddr);
        }
    }
    catch (Exception ex)""","success marker")
    return body

SINK_CODE='''// Opt-in PUBLIC trace writer; same process as producer, so NEVER attested.
// NSMB_PUBLIC_PRODUCER_TRACE must designate a new, absolute private path.
using System;
using System.IO;
using System.Text.Json;

internal sealed class PublicProducerTrace : IDisposable
{
    private readonly StreamWriter writer;
    private readonly string runId;
    private long nextSequence;

    private PublicProducerTrace(string path)
    {
        if (!Path.IsPathFullyQualified(path))
            throw new ArgumentException("Trace destination must be absolute.", nameof(path));
        // CreateNew avoids overwriting an older witness candidate.
        writer = new StreamWriter(new FileStream(path, FileMode.CreateNew,
            FileAccess.Write, FileShare.None)) { AutoFlush = true };
        runId = Guid.NewGuid().ToString("N"); // self-chosen, NOT trusted
        Emit("run_open", 0);
    }

    internal static PublicProducerTrace? OpenFromEnvironment()
    {
        var path = Environment.GetEnvironmentVariable("NSMB_PUBLIC_PRODUCER_TRACE");
        return string.IsNullOrWhiteSpace(path) ? null : new PublicProducerTrace(path);
    }

    internal static string HashFile(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(stream))
            .ToLowerInvariant();
    }

    // All uses must be on the serial root/commit/emission thread.
    internal void Emit(string kind, uint address, uint? parent = null,
                       string? sha256 = null)
    {
        writer.WriteLine(JsonSerializer.Serialize(new
        {
            schemaVersion = 2, runId, sequence = nextSequence++,
            kind, address, parent, sha256,
            producerAttested = false,
            authenticReleaseEligible = false
        }));
    }

    public void Dispose() => writer.Dispose();
}
'''

def make_patch(original):
    edited=finish(instrument(original))
    a=list(unified_diff(original.splitlines(keepends=True),
                        edited.splitlines(keepends=True),
                        fromfile="a/"+PROGRAM,tofile="b/"+PROGRAM))
    b=list(unified_diff([],SINK_CODE.splitlines(keepends=True),
                        fromfile="/dev/null",tofile="b/"+SINK))
    raw = ("diff --git a/"+PROGRAM+" b/"+PROGRAM+"\n"
           +"".join(a)+"diff --git a/"+SINK+" b/"+SINK+"\n"
           +"new file mode 100644\n"+"".join(b))
    # Empty added lines should be '+' not '+ ' (git diff --check).
    return re.sub(r"(?m)^\+[ \t]+$", "+", raw)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--public-checkout",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    original=(args.public_checkout/PROGRAM).read_text()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(make_patch(original))
    print("WROTE",args.output,"bytes",args.output.stat().st_size)
if __name__=="__main__":main()

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Only POST requests are allowed", { status: 405 });
    }

    try {
      // Step 1: Retrieve and decompress the gzipped data
      const compressedData = await request.arrayBuffer();
      const stream = new Response(compressedData).body;
      const decompressedStream = stream.pipeThrough(new DecompressionStream("gzip"));
      const decompressedText = await new Response(decompressedStream).text();

      // Step 2: Parse the decompressed text, keeping unique DeviceIDs and DeviceNames
      const logEntries = decompressedText.trim().split(/\r?\n/).map(line => JSON.parse(line));
      const uniqueDevices = new Map();

      logEntries.forEach(entry => {
        const { DeviceID, DeviceName } = entry;
        if (DeviceID && DeviceName) {
          uniqueDevices.set(DeviceID, DeviceName); // Only keeps unique DeviceID entries
        }
      });

      // Step 3: Iterate over unique DeviceIDs to fetch WARP device details and manage DNS
      const actions = [];
      for (const [deviceId, deviceName] of uniqueDevices) {
        const deviceDetails = await getDeviceDetails(deviceId, env);
        if (!deviceDetails || !deviceDetails.metadata || !deviceDetails.metadata.ipv4) {
          console.log(`Skipping DeviceID ${deviceId}: No details or IPv4 found`);
          continue;
        }

        const deviceData = {
          name: deviceName,
          ipv4: deviceDetails.metadata.ipv4
        };

        // Apply DNS record management and log actions
        const action = await manageDNSRecord(deviceData, env);
        if (action) {
          actions.push(action);
        }
      }

      // Return a summary of all actions taken
      const responseText = JSON.stringify(actions, null, 2);
      return new Response(responseText, {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    } catch (error) {
      console.error("Error processing Logpush data:", error);
      return new Response("Error processing data", { status: 500 });
    }
  }
};

// Fetch detailed information for a given DeviceID using the WARP API
async function getDeviceDetails(deviceId, env) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/warp/${deviceId}`;
  try {
    const response = await fetch(url, {
      headers: {
        "X-Auth-Email": env.EMAIL,
        "X-Auth-Key": env.API_KEY,
        "Content-Type": "application/json"
      }
    });
    const data = await response.json();

    if (!data.success) {
      console.log(`Failed to retrieve details for DeviceID ${deviceId}`);
      return null;
    }

    return data.result;
  } catch (error) {
    console.log(`Error fetching details for DeviceID ${deviceId}:`, error);
    return null;
  }
}

// DNS management logic for creating, updating, or deleting DNS records
async function manageDNSRecord(device, env) {
  const dnsName = `${device.name}.${env.DOMAIN_SUFFIX}`;
  const existingRecord = await getDNSRecord(dnsName, env);

  if (!existingRecord) {
    await createDNSRecord(dnsName, device.ipv4, env);
    return { action: "created", name: dnsName, ipv4: device.ipv4 };
  } else if (existingRecord.content !== device.ipv4) {
    const duplicateRecord = await findDuplicateDNSRecord(device.ipv4, env);

    if (duplicateRecord) {
      await deleteDNSRecord(duplicateRecord.id, env);
      await updateDNSRecord(existingRecord.id, dnsName, device.ipv4, env);
      return {
        action: "updated",
        name: dnsName,
        ipv4: device.ipv4,
        deleted_duplicate: duplicateRecord.name
      };
    } else {
      await updateDNSRecord(existingRecord.id, dnsName, device.ipv4, env);
      return { action: "updated", name: dnsName, ipv4: device.ipv4 };
    }
  }
  return { action: "no-change", name: dnsName, ipv4: device.ipv4 };
}

// Fetch an existing DNS A record for a given name
async function getDNSRecord(name, env) {
  const url = `https://api.cloudflare.com/client/v4/zones/${env.ZONE_ID}/dns_records?type=A&name=${name}`;
  const response = await fetch(url, {
    headers: {
      "X-Auth-Email": env.EMAIL,
      "X-Auth-Key": env.API_KEY,
      "Content-Type": "application/json"
    }
  });
  const data = await response.json();
  return data.success && data.result.length > 0 ? data.result[0] : null;
}

// Find a duplicate DNS A record by IPv4 address
async function findDuplicateDNSRecord(ipv4, env) {
  const url = `https://api.cloudflare.com/client/v4/zones/${env.ZONE_ID}/dns_records?type=A&content=${ipv4}`;
  const response = await fetch(url, {
    headers: {
      "X-Auth-Email": env.EMAIL,
      "X-Auth-Key": env.API_KEY,
      "Content-Type": "application/json"
    }
  });
  const data = await response.json();
  return data.success && data.result.length > 0 ? data.result[0] : null;
}

// Create a new DNS A record
async function createDNSRecord(name, content, env) {
  const url = `https://api.cloudflare.com/client/v4/zones/${env.ZONE_ID}/dns_records`;
  await fetch(url, {
    method: "POST",
    headers: {
      "X-Auth-Email": env.EMAIL,
      "X-Auth-Key": env.API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: "A",
      name: name,
      content: content,
      ttl: 3600,
      proxied: false
    })
  });
}

// Update an existing DNS A record with a new IP address
async function updateDNSRecord(recordId, name, content, env) {
  const url = `https://api.cloudflare.com/client/v4/zones/${env.ZONE_ID}/dns_records/${recordId}`;
  await fetch(url, {
    method: "PUT",
    headers: {
      "X-Auth-Email": env.EMAIL,
      "X-Auth-Key": env.API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: "A",
      name: name,
      content: content,
      ttl: 3600,
      proxied: false
    })
  });
}

// Delete a DNS A record by record ID
async function deleteDNSRecord(recordId, env) {
  const url = `https://api.cloudflare.com/client/v4/zones/${env.ZONE_ID}/dns_records/${recordId}`;
  await fetch(url, {
    method: "DELETE",
    headers: {
      "X-Auth-Email": env.EMAIL,
      "X-Auth-Key": env.API_KEY,
      "Content-Type": "application/json"
    }
  });
}

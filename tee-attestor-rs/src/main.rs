use axum::{routing::get, routing::post, Json, Router};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::net::SocketAddr;

#[derive(Debug, Deserialize)]
struct TeeCommitInput {
    content_id: String,
    content_hash: String,
    verification_id: String,
    verification_level: String,
    nullifier_hash: String,
    signal: String,
    action: String,
    parent_ids: Vec<String>,
    created_at_ms: u64,
}

#[derive(Debug, Serialize)]
struct TeeCommitOutput {
    tee_mode: String,
    verifier_binary_hash: String,
    public_values_b64: String,
    public_values_commitment_hash_hex: String,
    signature_b64: String,
    signing_public_key_pem: String,
}

#[derive(Debug, Serialize)]
struct Health {
    ok: bool,
    service: &'static str,
    mode: &'static str,
}

#[tokio::main]
async fn main() {
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|x| x.parse().ok())
        .unwrap_or(3400);

    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/attest", post(attest));

    let addr: SocketAddr = format!("{}:{}", host, port).parse().expect("valid addr");
    println!("tee-attestor-rs listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}

async fn healthz() -> Json<Health> {
    Json(Health {
        ok: true,
        service: "tee-attestor-rs",
        mode: "mock-via-livy-tee-wire",
    })
}

async fn attest(Json(input): Json<TeeCommitInput>) -> Json<TeeCommitOutput> {
    let mut pv = livy_tee::PublicValues::new();
    pv.commit(&input.content_id);
    pv.commit(&input.content_hash);
    pv.commit(&input.verification_id);
    pv.commit(&format!("world:level:{}", input.verification_level));
    pv.commit(&format!("world:nullifier:{}", input.nullifier_hash));
    pv.commit(&format!("world:signal:{}", input.signal));
    pv.commit(&format!("world:action:{}", input.action));
    pv.commit(&input.parent_ids);
    pv.commit(&input.created_at_ms);

    let wired = pv.as_bytes();
    let commitment = Sha256::digest(wired);
    let commitment_hex = hex_encode(&commitment);

    let verifier_binary_hash = hex_encode(&Sha256::digest(b"tee-attestor-rs-mock"));
    let signature_b64 = base64::engine::general_purpose::STANDARD
        .encode(format!("mock-signature:{}:{}", input.content_id, commitment_hex));

    Json(TeeCommitOutput {
        tee_mode: "mock".to_string(),
        verifier_binary_hash,
        public_values_b64: base64::engine::general_purpose::STANDARD.encode(wired),
        public_values_commitment_hash_hex: commitment_hex,
        signature_b64,
        signing_public_key_pem: "mock-key:no-public-key-in-mock-mode".to_string(),
    })
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write as _;
        let _ = write!(&mut s, "{:02x}", b);
    }
    s
}

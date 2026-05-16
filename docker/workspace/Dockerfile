FROM public.ecr.aws/ubuntu/ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssh-server ca-certificates sudo curl git \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /run/sshd \
  && ssh-keygen -A \
  && sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication yes/' /etc/ssh/sshd_config \
  && sed -i 's/^#\?UsePAM .*/UsePAM yes/' /etc/ssh/sshd_config

CMD ["/usr/sbin/sshd", "-D", "-e"]
